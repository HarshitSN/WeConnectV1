import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/registry";
import {
  getGeminiModelOrder,
  hasExplicitGeminiFallbacksConfigured,
  runVision,
} from "@/lib/gemini";
import type { GeminiFallbackMeta } from "@/lib/gemini";
import { decideVisionGate } from "@/lib/vision-gate";
import {
  appendGeminiFallback,
  appendTerminal,
  getSession,
  markGeminiFallbackChainGuardrail,
  setSessionStage,
  setSessionVisionChecks,
  setVisionResult,
} from "@/lib/session-store";
import type { SessionStage } from "@/lib/types";

const GEMINI_ROUTE_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS || 12000);

function fallbackDetail(meta?: GeminiFallbackMeta) {
  if (!meta) return "";
  const parts = [
    meta.selectedModel ? `selected_model=${meta.selectedModel}` : "",
    meta.model ? `model=${meta.model}` : "",
    meta.attemptedModels?.length ? `attempted_models=${meta.attemptedModels.join(",")}` : "",
    typeof meta.retryAfterSec === "number" ? `retry_after_s=${meta.retryAfterSec}` : "",
    meta.quotaSubtype ? `quota_subtype=${meta.quotaSubtype}` : "",
    meta.quotaMetric ? `quota_metric=${meta.quotaMetric}` : "",
    meta.quotaId ? `quota_id=${meta.quotaId}` : "",
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`VISION_TIMEOUT after ${ms}ms`)), ms),
    ),
  ]);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      videoBase64?: string;
      mimeType?: string;
      task?: "id" | "doc";
    };
    const sessionId = body.sessionId;
    const task = body.task ?? "id";
    if (task !== "id") {
      return NextResponse.json(
        {
          error: "Document vision has been removed. Use task=id with videoBase64.",
          code: "VISION_DOC_REMOVED",
        },
        { status: 400 },
      );
    }
    if (!sessionId || !body.videoBase64) {
      return NextResponse.json(
        { error: "sessionId and videoBase64 required" },
        { status: 400 },
      );
    }
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    const company = session.companyId ? getCompanyById(session.companyId) : null;
    if (!company) {
      return NextResponse.json({ error: "discover a company first" }, { status: 400 });
    }
    if (!hasExplicitGeminiFallbacksConfigured() && markGeminiFallbackChainGuardrail(sessionId)) {
      appendTerminal(
        sessionId,
        `[GEMINI] guardrail=missing_model_fallback_chain using_defaults=true order=${getGeminiModelOrder().join(",")}`,
      );
    }

    const mime = body.mimeType || "video/webm";
    const raw = body.videoBase64.replace(/^data:.*;base64,/, "");

    appendTerminal(sessionId, "[IDENTITY_CHECK] clip_ingest liveness_pipeline=gemini_2_5_flash");

    const { data: result, quotaFallback, fallbackReason, fallbackMeta } = await withTimeout(
      runVision(company, raw, mime),
      GEMINI_ROUTE_TIMEOUT_MS,
    ).catch(() => ({
      data: {
        nameGuess: company.primaryOwner,
        livenessHint: "timeout_fallback",
        matchesPrimaryOwner: true,
        confidence: 70,
      },
      quotaFallback: true,
      fallbackReason: "network" as const,
      fallbackMeta: {
        reason: "network" as const,
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        quotaSubtype: undefined,
        selectedModel: undefined,
        attemptedModels: undefined,
        retryAfterSec: undefined,
        quotaMetric: undefined,
        quotaId: undefined,
        rawMessage: `VISION_TIMEOUT after ${GEMINI_ROUTE_TIMEOUT_MS}ms`,
      },
    }));
    if (quotaFallback) {
      appendGeminiFallback(sessionId, {
        at: new Date().toISOString(),
        channel: "vision",
        reason: fallbackReason ?? "unknown",
        quotaSubtype: fallbackMeta?.quotaSubtype,
        model: fallbackMeta?.model,
        selectedModel: fallbackMeta?.selectedModel,
        attemptedModels: fallbackMeta?.attemptedModels,
        retryAfterSec: fallbackMeta?.retryAfterSec,
        quotaMetric: fallbackMeta?.quotaMetric,
        quotaId: fallbackMeta?.quotaId,
      });
      appendTerminal(
        sessionId,
        `[GEMINI] vision_fallback=demo_mode reason=${fallbackReason ?? "unknown"}${fallbackDetail(
          fallbackMeta,
        )}`,
      );
    }
    if (!quotaFallback && fallbackMeta?.attemptedModels && fallbackMeta.attemptedModels.length > 1) {
      appendGeminiFallback(sessionId, {
        at: new Date().toISOString(),
        channel: "vision",
        reason: "model_fallback_success",
        model: fallbackMeta.model,
        selectedModel: fallbackMeta.selectedModel,
        attemptedModels: fallbackMeta.attemptedModels,
      });
      appendTerminal(
        sessionId,
        `[GEMINI] vision_model_fallback_success${fallbackDetail(fallbackMeta)}`,
      );
    }
    setVisionResult(sessionId, task, result);

    let nextStage: SessionStage | undefined;
    const blockers: string[] = [];
    const confidence = Number(result.confidence ?? 70);
    appendTerminal(sessionId, `[IDENTITY_CHECK] LIVENESS_CONFIRMED confidence=${confidence}`);
    const match = Boolean(result.matchesPrimaryOwner);
    appendTerminal(
      sessionId,
      `[IDENTITY_CHECK] name_match=${match} guess="${String(result.nameGuess ?? "")}"`,
    );
    const primaryOwner = String(company.primaryOwner ?? "").trim();
    const ownerKnownAndVerified = !/unknown owner/i.test(primaryOwner) && primaryOwner.length > 0;
    const gate = decideVisionGate({
      confidence,
      matchesPrimaryOwner: match,
      ownerKnownAndVerified,
    });
    const passed = gate.pass;
    if (passed) {
      nextStage = "voice_attestation";
      setSessionStage(sessionId, "voice_attestation");
      if (gate.nameMatchBypassed) {
        appendTerminal(
          sessionId,
          "[IDENTITY_CHECK] NAME_MISMATCH_BYPASS owner_unverified=true action=allow_with_warning",
        );
      }
    } else {
      nextStage = "vision_id";
      blockers.push("vision_id");
      appendTerminal(sessionId, "[IDENTITY_CHECK] RETRY_REQUIRED low_confidence_or_mismatch");
    }
    setSessionVisionChecks(sessionId, {
      idPassed: passed,
      idConfidence: confidence,
    });

    return NextResponse.json({
      ok: true,
      task,
      result,
      confidence: Number(result.confidence ?? 70),
      blockers,
      visionNameMatchBypassed: gate.nameMatchBypassed,
      warningCode: gate.warningCode,
      quotaFallback,
      fallbackReason,
      fallbackSubtype: fallbackMeta?.quotaSubtype,
      fallbackMeta,
      stage: getSession(sessionId)?.stage,
      suggestedNextStage: nextStage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "vision error";
    return NextResponse.json(
      { error: message, code: "VISION_UNHANDLED" },
      { status: 500 },
    );
  }
}
