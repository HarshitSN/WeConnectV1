import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/registry";
import { emptyRegistrationDraft, validateRegistration } from "@/lib/registration";
import {
  getGeminiModelOrder,
  hasExplicitGeminiFallbacksConfigured,
  runAgentTurn,
  runAttestationAnalysis,
} from "@/lib/gemini";
import type { GeminiFallbackMeta } from "@/lib/gemini";
import {
  appendGeminiFallback,
  appendTerminal,
  getSession,
  getSessionRegistration,
  markGeminiFallbackChainGuardrail,
  pushMessage,
  setSessionStage,
  setAttestation,
} from "@/lib/session-store";
import { getDomainState } from "@/lib/store/domain-store";
import type { SessionStage } from "@/lib/types";

const STAGES: SessionStage[] = [
  "idle",
  "discovered",
  "voice_confirm",
  "doc_upload",
  "vision_id",
  "voice_attestation",
  "anchoring",
  "complete",
];

const GEMINI_ROUTE_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS || 12000);

function isStage(s: string): s is SessionStage {
  return STAGES.includes(s as SessionStage);
}

function dialogueHistory(sessionId: string) {
  const fresh = getSession(sessionId);
  if (!fresh) return [];
  return fresh.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
}

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

function hasAffirmation(text: string) {
  return /(?:^|\b)(yes|yeah|yep|correct|that's me|thats me|i am|sure|confirmed)\b/i.test(text);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AGENT_TIMEOUT after ${ms}ms`)), ms),
    ),
  ]);
}

function localTurnFallback(
  stage: SessionStage,
  userText: string,
): {
  assistantText: string;
  nextStage: SessionStage | null;
  manualReviewSuggested: boolean;
  controlAndManagementScore: number;
} {
  const affirmed = hasAffirmation(userText);
  if (stage === "discovered") {
    return affirmed
      ? {
          assistantText:
            "Thanks for confirming. Please upload your business registration document. Once uploaded, say yes or confirm to proceed.",
          nextStage: "doc_upload",
          manualReviewSuggested: false,
          controlAndManagementScore: 75,
        }
      : {
          assistantText:
            "Web prefill is ready. Are you ready to verify the rest in about sixty seconds?",
          nextStage: "voice_confirm",
          manualReviewSuggested: false,
          controlAndManagementScore: 75,
        };
  }
  if (stage === "voice_confirm") {
    return affirmed
      ? {
          assistantText:
            "Thank you. Please upload your business registration document. Once uploaded, say yes or confirm to proceed.",
          nextStage: "doc_upload",
          manualReviewSuggested: false,
          controlAndManagementScore: 80,
        }
      : {
          assistantText: "Please say yes to confirm you are the primary owner, then I will prompt for document upload.",
          nextStage: null,
          manualReviewSuggested: false,
          controlAndManagementScore: 70,
        };
  }
  if (stage === "doc_upload") {
    return affirmed
      ? {
          assistantText:
            "Thank you. Please hold your government ID steady in front of the camera. I will scan it now.",
          nextStage: "vision_id",
          manualReviewSuggested: false,
          controlAndManagementScore: 80,
        }
      : {
          assistantText: "Please upload your business registration document and tell me when it is ready.",
          nextStage: null,
          manualReviewSuggested: false,
          controlAndManagementScore: 75,
        };
  }
  return {
    assistantText: "Please continue with the on-screen verification steps.",
    nextStage: null,
    manualReviewSuggested: false,
    controlAndManagementScore: 70,
  };
}

function shouldBlockAnchoringTransition(
  nextStage: SessionStage | null | undefined,
  missingRequired: string[],
) {
  return nextStage === "anchoring" && missingRequired.length > 0;
}

function readinessPrompt(missingRequired: string[]) {
  if (missingRequired.includes("paid")) {
    return "Verification is complete. Please complete payment to issue your certificate.";
  }
  if (missingRequired.includes("country")) {
    return "Please complete country details before certificate issuance.";
  }
  if (missingRequired.includes("country_confirmation")) {
    return "Please confirm the country field before certificate issuance.";
  }
  if (missingRequired.includes("naics_codes_invalid") || missingRequired.includes("unspsc_codes_invalid")) {
    return "Please correct NAICS/UNSPSC code format before issuing certificate.";
  }
  return "Please complete remaining required fields before issuing certificate.";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      userText?: string;
      mode?: "dialogue" | "attestation";
    };
    const sessionId = body.sessionId;
    const userText = body.userText?.trim() ?? "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const company = session.companyId
      ? (getCompanyById(session.companyId) ?? session.companySnapshot ?? null)
      : (session.companySnapshot ?? null);
    const workflow = getDomainState(sessionId);
    const isDigitalPath =
      workflow.certificationType === "digital" ||
      getSessionRegistration(sessionId)?.cert_type === "digital";
    const validation = validateRegistration(
      session.registration ?? emptyRegistrationDraft(),
      isDigitalPath ? (session.paid ?? false) : true,
    );
    if (!hasExplicitGeminiFallbacksConfigured() && markGeminiFallbackChainGuardrail(sessionId)) {
      appendTerminal(
        sessionId,
        `[GEMINI] guardrail=missing_model_fallback_chain using_defaults=true order=${getGeminiModelOrder().join(",")}`,
      );
    }

    if (body.mode === "attestation" && company && userText) {
      appendTerminal(sessionId, "[VOICE_ATTESTATION] transcript_received");
      const a = await withTimeout(
        runAttestationAnalysis(company, userText),
        GEMINI_ROUTE_TIMEOUT_MS,
      ).catch(() => ({
        score: userText.trim().length < 20 ? 55 : 72,
        manualReview: userText.trim().length < 20,
        rationale: "Timed out calling Gemini attestation; used local fallback.",
        quotaFallback: true,
        fallbackReason: "network" as const,
        fallbackSubtype: undefined,
        fallbackMeta: undefined,
      }));
      setAttestation(sessionId, a.score, a.manualReview, a.rationale);
      if (a.manualReview) {
        appendTerminal(
          sessionId,
          `[RISK_ML] manual_review_suggested score=${a.score} rationale="${(a.rationale ?? "").slice(0, 80)}"`,
        );
      } else {
        appendTerminal(sessionId, `[RISK_ML] score=${a.score} pass_heuristic=true`);
      }
      if (a.quotaFallback) {
        appendGeminiFallback(sessionId, {
          at: new Date().toISOString(),
            channel: "attestation",
            reason: a.fallbackReason ?? "unknown",
            quotaSubtype: a.fallbackSubtype,
            model: a.fallbackMeta?.model,
            selectedModel: a.fallbackMeta?.selectedModel,
            attemptedModels: a.fallbackMeta?.attemptedModels,
          retryAfterSec: a.fallbackMeta?.retryAfterSec,
          quotaMetric: a.fallbackMeta?.quotaMetric,
          quotaId: a.fallbackMeta?.quotaId,
        });
        appendTerminal(
          sessionId,
          `[GEMINI] attestation_fallback=demo_mode reason=${a.fallbackReason ?? "unknown"}${fallbackDetail(
            a.fallbackMeta,
          )}`,
        );
      }
      if (!a.quotaFallback && a.fallbackMeta?.attemptedModels && a.fallbackMeta.attemptedModels.length > 1) {
        appendGeminiFallback(sessionId, {
          at: new Date().toISOString(),
          channel: "attestation",
          reason: "model_fallback_success",
          model: a.fallbackMeta.model,
          selectedModel: a.fallbackMeta.selectedModel,
          attemptedModels: a.fallbackMeta.attemptedModels,
        });
        appendTerminal(
          sessionId,
          `[GEMINI] attestation_model_fallback_success${fallbackDetail(a.fallbackMeta)}`,
        );
      }
      pushMessage(sessionId, { role: "user", content: userText });
      const history = dialogueHistory(sessionId);
      const turn = await withTimeout(
        runAgentTurn(
          company,
          "voice_attestation",
          history,
          validation.missingRequired,
        ),
        GEMINI_ROUTE_TIMEOUT_MS,
      ).catch(() => ({
        assistantText: "Verification complete. Anchoring your certificate to the QID chain now.",
        nextStage: "anchoring" as SessionStage | null,
        manualReviewSuggested: false,
        controlAndManagementScore: 72,
        uiHints: undefined,
        quotaFallback: true,
        fallbackReason: "network" as const,
        fallbackSubtype: undefined,
        fallbackMeta: undefined,
      }));
      const blockedAnchoring = shouldBlockAnchoringTransition(turn.nextStage, validation.missingRequired);
      const effectiveTurn = blockedAnchoring
        ? {
            ...turn,
            nextStage: "voice_attestation" as SessionStage | null,
            assistantText: readinessPrompt(validation.missingRequired),
            uiHints: { ...(turn.uiHints ?? {}), badge: "READINESS REQUIRED" },
          }
        : turn;
      if (effectiveTurn.nextStage && isStage(effectiveTurn.nextStage)) {
        setSessionStage(sessionId, effectiveTurn.nextStage);
      }
      pushMessage(sessionId, { role: "assistant", content: effectiveTurn.assistantText });
      const quotaFallback = Boolean(a.quotaFallback || effectiveTurn.quotaFallback);
      return NextResponse.json({
        ...effectiveTurn,
        stage: getSession(sessionId)?.stage,
        attestation: a,
        quotaFallback,
        fallbackReason: effectiveTurn.fallbackReason ?? a.fallbackReason,
        fallbackSubtype: effectiveTurn.fallbackSubtype ?? a.fallbackSubtype,
        fallbackMeta: effectiveTurn.fallbackMeta ?? a.fallbackMeta,
      });
    }

    if (userText) {
      pushMessage(sessionId, { role: "user", content: userText });
    }

    const history = dialogueHistory(sessionId);
    const stage = getSession(sessionId)?.stage ?? session.stage;
    const turn = await withTimeout(
      runAgentTurn(company, stage, history, validation.missingRequired),
      GEMINI_ROUTE_TIMEOUT_MS,
    ).catch(() => ({
      ...localTurnFallback(stage, userText),
      uiHints: undefined,
      raw: undefined,
      quotaFallback: true,
      fallbackReason: "network" as const,
      fallbackSubtype: undefined,
      fallbackMeta: undefined,
    }));

    if (turn.quotaFallback) {
      appendGeminiFallback(sessionId, {
        at: new Date().toISOString(),
        channel: "agent",
        reason: turn.fallbackReason ?? "unknown",
        quotaSubtype: turn.fallbackSubtype,
        model: turn.fallbackMeta?.model,
        selectedModel: turn.fallbackMeta?.selectedModel,
        attemptedModels: turn.fallbackMeta?.attemptedModels,
        retryAfterSec: turn.fallbackMeta?.retryAfterSec,
        quotaMetric: turn.fallbackMeta?.quotaMetric,
        quotaId: turn.fallbackMeta?.quotaId,
      });
      appendTerminal(
        sessionId,
        `[GEMINI] agent_fallback=demo_mode reason=${turn.fallbackReason ?? "unknown"}${fallbackDetail(
          turn.fallbackMeta,
        )}`,
      );
    }
    if (!turn.quotaFallback && turn.fallbackMeta?.attemptedModels && turn.fallbackMeta.attemptedModels.length > 1) {
      appendGeminiFallback(sessionId, {
        at: new Date().toISOString(),
        channel: "agent",
        reason: "model_fallback_success",
        model: turn.fallbackMeta.model,
        selectedModel: turn.fallbackMeta.selectedModel,
        attemptedModels: turn.fallbackMeta.attemptedModels,
      });
      appendTerminal(
        sessionId,
        `[GEMINI] agent_model_fallback_success${fallbackDetail(turn.fallbackMeta)}`,
      );
    }

    let effectiveNextStage = turn.nextStage;
    let effectiveAssistantText = turn.assistantText;
    const affirmed = hasAffirmation(userText);
    if (stage === "discovered" && affirmed) {
      effectiveNextStage = "doc_upload";
      effectiveAssistantText =
        "Thanks for confirming. Please upload your business registration document. Once uploaded, say yes or confirm to proceed.";
    } else if (stage === "discovered" && !effectiveNextStage) {
      effectiveNextStage = "voice_confirm";
    } else if (stage === "voice_confirm" && affirmed) {
      effectiveNextStage = "doc_upload";
      effectiveAssistantText =
        "Thank you. Please upload your business registration document. Once uploaded, say yes or confirm to proceed.";
    } else if (stage === "doc_upload" && affirmed) {
      effectiveNextStage = "vision_id";
      effectiveAssistantText =
        "Thank you. Please hold your government ID steady in front of the camera. I will scan it now.";
    }
    if (shouldBlockAnchoringTransition(effectiveNextStage, validation.missingRequired)) {
      effectiveNextStage = "voice_attestation";
      effectiveAssistantText = readinessPrompt(validation.missingRequired);
    }

    if (effectiveNextStage && isStage(effectiveNextStage)) {
      setSessionStage(sessionId, effectiveNextStage);
    }

    if (/id|camera|scan/i.test(effectiveAssistantText) && stage === "voice_confirm") {
      appendTerminal(sessionId, "[VOICE_PIPELINE] confirm_intent_detected");
    }

    pushMessage(sessionId, { role: "assistant", content: effectiveAssistantText });

    return NextResponse.json({
      assistantText: effectiveAssistantText,
      stage: getSession(sessionId)?.stage,
      manualReviewSuggested: turn.manualReviewSuggested,
      controlAndManagementScore: turn.controlAndManagementScore,
      uiHints: turn.uiHints,
      quotaFallback: Boolean(turn.quotaFallback),
      fallbackReason: turn.fallbackReason,
      fallbackSubtype: turn.fallbackSubtype,
      fallbackMeta: turn.fallbackMeta,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "agent error";
    return NextResponse.json(
      { error: message, code: "AGENT_UNHANDLED" },
      { status: 500 },
    );
  }
}
