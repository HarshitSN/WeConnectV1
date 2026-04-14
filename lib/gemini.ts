import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildAttestationInstruction,
  buildSystemInstruction,
  visionIdPrompt,
} from "./prompts/wec-guardian";
import type { RegistryCompany } from "./types";
import type { SessionStage } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_CALL_TIMEOUT_MS = 12_000;
const DEFAULT_GEMINI_QUOTA_COOLDOWN_MS = 60_000;
const SAFE_DEFAULT_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;
let warnedMissingFallbackChain = false;
let quotaCooldownUntilMs = 0;
export type GeminiFallbackReason =
  | "quota"
  | "api_key_invalid"
  | "model_not_found"
  | "permission"
  | "network"
  | "unknown";
export type GeminiQuotaSubtype = "capacity" | "quota";

export type GeminiFallbackMeta = {
  reason: GeminiFallbackReason;
  quotaSubtype?: GeminiQuotaSubtype;
  model?: string;
  selectedModel?: string;
  attemptedModels?: string[];
  retryAfterSec?: number;
  quotaMetric?: string;
  quotaId?: string;
  rawMessage?: string;
};

export type AgentTurnResult = {
  assistantText: string;
  nextStage: SessionStage | null;
  manualReviewSuggested: boolean;
  controlAndManagementScore: number;
  uiHints?: { highlight?: string[]; badge?: string | null };
  raw?: string;
  /** True when the live model failed (e.g. 429 quota) and local demo logic was used */
  quotaFallback?: boolean;
  fallbackReason?: GeminiFallbackReason;
  fallbackSubtype?: GeminiQuotaSubtype;
  fallbackMeta?: GeminiFallbackMeta;
};

export type VisionResult = {
  data: Record<string, unknown>;
  quotaFallback: boolean;
  fallbackReason?: GeminiFallbackReason;
  fallbackSubtype?: GeminiQuotaSubtype;
  fallbackMeta?: GeminiFallbackMeta;
};

export type AttestationResult = {
  score: number;
  manualReview: boolean;
  rationale: string;
  quotaFallback?: boolean;
  fallbackReason?: GeminiFallbackReason;
  fallbackSubtype?: GeminiQuotaSubtype;
  fallbackMeta?: GeminiFallbackMeta;
};

function getModelByName(modelName: string, systemInstruction?: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const gen = new GoogleGenerativeAI(key);
  return gen.getGenerativeModel({
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
  });
}

function parseModelList(raw: string | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export function hasExplicitGeminiFallbacksConfigured(): boolean {
  return parseModelList(process.env.GEMINI_MODEL_FALLBACKS).length > 0;
}

function maybeWarnMissingFallbackChain() {
  if (warnedMissingFallbackChain) return;
  if (!process.env.GEMINI_API_KEY || hasExplicitGeminiFallbacksConfigured()) return;
  warnedMissingFallbackChain = true;
  console.warn(
    "[GEMINI] guardrail=missing_model_fallback_chain fallback_env=empty using_safe_defaults=true",
  );
}

export function getGeminiModelOrder(): string[] {
  maybeWarnMissingFallbackChain();
  const primary = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const envFallbacks = parseModelList(process.env.GEMINI_MODEL_FALLBACKS);
  const fallbacks =
    envFallbacks.length > 0
      ? envFallbacks
      : SAFE_DEFAULT_FALLBACKS.filter((m) => m !== primary);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (!seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  }
  return ordered;
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function extractGeminiFallbackReason(error: unknown): GeminiFallbackReason {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  if (message.includes("429") || message.includes("quota") || message.includes("rate limit")) return "quota";
  if (message.includes("api key") || message.includes("invalid key") || message.includes("unauthenticated")) {
    return "api_key_invalid";
  }
  if (message.includes("404") || message.includes("model") && message.includes("not found")) {
    return "model_not_found";
  }
  if (message.includes("403") || message.includes("permission") || message.includes("forbidden")) {
    return "permission";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("econn") ||
    message.includes("enotfound")
  ) {
    return "network";
  }
  return "unknown";
}

function extractQuotaSubtype(message: string): GeminiQuotaSubtype | undefined {
  const lower = message.toLowerCase();
  if (
    lower.includes("resource_exhausted") ||
    lower.includes("capacity") ||
    lower.includes("overloaded") ||
    lower.includes("temporarily unavailable")
  ) {
    return "capacity";
  }
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("429")) {
    return "quota";
  }
  return undefined;
}

export function extractGeminiFallbackMeta(error: unknown): GeminiFallbackMeta {
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  const reason = extractGeminiFallbackReason(error);
  const modelMatch = message.match(/model:\s*([a-zA-Z0-9.\-_]+)/i);
  const retryMatch =
    message.match(/retry in\s+([\d.]+)\s*s/i) ||
    message.match(/"retryDelay"\s*:\s*"(\d+)s"/i) ||
    message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
  const quotaMetricMatch = message.match(/"quotaMetric"\s*:\s*"([^"]+)"/i);
  const quotaIdMatch = message.match(/"quotaId"\s*:\s*"([^"]+)"/i);
  const retryAfterSec = retryMatch?.[1] ? Number(retryMatch[1]) : undefined;

  return {
    reason,
    quotaSubtype: reason === "quota" ? extractQuotaSubtype(message) : undefined,
    model: modelMatch?.[1] || process.env.GEMINI_MODEL || DEFAULT_MODEL,
    retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
    quotaMetric: quotaMetricMatch?.[1],
    quotaId: quotaIdMatch?.[1],
    rawMessage: message.slice(0, 260),
  };
}

function isRetryableGeminiError(reason: GeminiFallbackReason) {
  return reason === "network" || reason === "quota";
}

function getQuotaCooldownMs(meta?: GeminiFallbackMeta): number {
  const configured = Number(process.env.GEMINI_QUOTA_COOLDOWN_MS || DEFAULT_GEMINI_QUOTA_COOLDOWN_MS);
  const base = Number.isFinite(configured) && configured >= 1_000 ? configured : DEFAULT_GEMINI_QUOTA_COOLDOWN_MS;
  if (typeof meta?.retryAfterSec === "number" && Number.isFinite(meta.retryAfterSec)) {
    return Math.max(base, Math.round(meta.retryAfterSec * 1000));
  }
  return base;
}

function activateQuotaCooldown(meta?: GeminiFallbackMeta) {
  quotaCooldownUntilMs = Date.now() + getQuotaCooldownMs(meta);
}

function quotaCooldownMeta(): GeminiFallbackMeta {
  const remainingSec = Math.max(1, Math.ceil((quotaCooldownUntilMs - Date.now()) / 1000));
  return {
    reason: "quota",
    quotaSubtype: "quota",
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    retryAfterSec: remainingSec,
    rawMessage: `GEMINI_QUOTA_COOLDOWN_ACTIVE retry in ${remainingSec}s`,
  };
}

async function generateWithRetry(
  model: ReturnType<typeof getModelByName>,
  input: unknown,
  maxAttempts = 2,
) {
  const timeoutMs = Number(process.env.GEMINI_CALL_TIMEOUT_MS || DEFAULT_GEMINI_CALL_TIMEOUT_MS);
  const safeTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 2000 ? Math.min(timeoutMs, 60000) : DEFAULT_GEMINI_CALL_TIMEOUT_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await Promise.race([
        model!.generateContent(input as never),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`GEMINI_CALL_TIMEOUT after ${safeTimeoutMs}ms`)), safeTimeoutMs),
        ),
      ]);
    } catch (error) {
      lastError = error;
      const meta = extractGeminiFallbackMeta(error);
      const reason = meta.reason;
      if (String(meta.rawMessage ?? "").includes("GEMINI_CALL_TIMEOUT")) {
        throw error;
      }
      if (reason === "quota") {
        activateQuotaCooldown(meta);
        throw error;
      }
      if (attempt >= maxAttempts || !isRetryableGeminiError(reason)) {
        throw error;
      }
      const suggestedMs =
        typeof meta.retryAfterSec === "number" ? Math.round(meta.retryAfterSec * 1000) : undefined;
      const boundedSuggestedMs =
        typeof suggestedMs === "number"
          ? Math.max(1_200, Math.min(15_000, suggestedMs))
          : undefined;
      const delayMs = boundedSuggestedMs ?? (reason === "quota" ? 2_500 * attempt : 700 * attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error("gemini_generate_failed");
}

type ModelRunResult = {
  text: string;
  attemptedModels: string[];
  selectedModel: string;
  fallbackMeta?: GeminiFallbackMeta;
};

async function generateWithModelFallback(
  input: unknown,
  systemInstruction?: string,
): Promise<ModelRunResult> {
  if (Date.now() < quotaCooldownUntilMs) {
    const meta = quotaCooldownMeta();
    const error = new Error(meta.rawMessage || "gemini_quota_cooldown_active") as Error & {
      fallbackMeta?: GeminiFallbackMeta;
    };
    error.fallbackMeta = meta;
    throw error;
  }
  const modelNames = getGeminiModelOrder();
  if (!modelNames.length || !process.env.GEMINI_API_KEY) {
    throw new Error("gemini_missing_config");
  }

  const attemptedModels: string[] = [];
  let firstFailure: GeminiFallbackMeta | null = null;
  let lastError: unknown;

  for (const name of modelNames) {
    const model = getModelByName(name, systemInstruction);
    if (!model) continue;
    attemptedModels.push(name);
    try {
      const result = await generateWithRetry(model, input);
      const text = result.response.text();
      const fallbackMeta =
        attemptedModels.length > 1
          ? {
              reason: firstFailure?.reason ?? "unknown",
              model: firstFailure?.model ?? attemptedModels[0],
              selectedModel: name,
              attemptedModels,
              retryAfterSec: firstFailure?.retryAfterSec,
              quotaMetric: firstFailure?.quotaMetric,
              quotaId: firstFailure?.quotaId,
              rawMessage: firstFailure?.rawMessage,
            }
          : undefined;
      return { text, attemptedModels, selectedModel: name, fallbackMeta };
    } catch (error) {
      lastError = error;
      const meta = extractGeminiFallbackMeta(error);
      if (meta.reason === "quota") {
        activateQuotaCooldown(meta);
      }
      if (!firstFailure) firstFailure = { ...meta, attemptedModels: [...attemptedModels] };
      const retryableAcrossModels =
        meta.reason === "quota" || meta.reason === "model_not_found";
      if (!retryableAcrossModels) {
        break;
      }
    }
  }

  const lastMeta = extractGeminiFallbackMeta(lastError);
  const error = new Error(lastMeta.rawMessage || "gemini_generate_failed") as Error & {
    fallbackMeta?: GeminiFallbackMeta;
  };
  error.fallbackMeta = {
    ...lastMeta,
    attemptedModels,
    selectedModel: attemptedModels[attemptedModels.length - 1],
  };
  throw error;
}

export async function runAgentTurn(
  company: RegistryCompany | null,
  stage: SessionStage,
  history: { role: string; content: string }[],
  missingRequired: string[] = [],
): Promise<AgentTurnResult> {
  const system = buildSystemInstruction(company, stage, missingRequired);
  if (!hasGeminiKey()) {
    return { ...mockAgentTurn(company, stage, history, missingRequired), quotaFallback: false };
  }

  const recent = history.slice(-12);
  const transcript = recent
    .map((m) => `${m.role === "assistant" ? "ASSISTANT" : "USER"}: ${m.content}`)
    .join("\n\n");
  const prompt = `Transcript (most recent last):\n${transcript || "USER: Hello."}\n\nProduce your next assistant turn as JSON only.`;
  try {
    const run = await generateWithModelFallback(prompt, system);
    return {
      ...parseAgentJson(run.text),
      fallbackMeta: run.fallbackMeta,
    };
  } catch (error) {
    const fallbackMeta =
      (error as { fallbackMeta?: GeminiFallbackMeta })?.fallbackMeta ??
      extractGeminiFallbackMeta(error);
    return {
      ...mockAgentTurn(company, stage, history, missingRequired),
      quotaFallback: true,
      fallbackReason: fallbackMeta.reason,
      fallbackSubtype: fallbackMeta.quotaSubtype,
      fallbackMeta,
    };
  }
}

function parseAgentJson(text: string) {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const j = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      assistantText: String(j.assistantText ?? "Continuing verification."),
      nextStage: (j.nextStage as SessionStage | null) ?? null,
      manualReviewSuggested: Boolean(j.manualReviewSuggested),
      controlAndManagementScore: Number(j.controlAndManagementScore ?? 70),
      uiHints: j.uiHints as
        | { highlight?: string[]; badge?: string | null }
        | undefined,
      raw: text,
    };
  } catch {
    return {
      assistantText: text.slice(0, 400) || "I am ready to continue.",
      nextStage: null,
      manualReviewSuggested: false,
      controlAndManagementScore: 70,
      raw: text,
    };
  }
}

function mockAgentTurn(
  company: RegistryCompany | null,
  stage: SessionStage,
  history: { role: string; content: string }[],
  missingRequired: string[] = [],
): Omit<AgentTurnResult, "quotaFallback"> {
  const last = history.filter((h) => h.role === "user").pop()?.content ?? "";

  if (!company) {
    return {
      assistantText:
        "I do not have a registry match yet. Please enter a business name from the demo knowledge base, such as Global Tech Solutions.",
      nextStage: null as SessionStage | null,
      manualReviewSuggested: false,
      controlAndManagementScore: 50,
    };
  }

  if (stage === "discovered") {
    const missingSummary = missingRequired.filter((f) => f !== "paid").join(", ");
    return {
      assistantText: `Hi — I'm WEC-Guardian. I found ${company.companyName} in ${company.jurisdiction}. Primary owner on file: ${company.primaryOwner}. Web prefill is ready${missingSummary ? `; remaining fields: ${missingSummary}` : ""}. Are you ready to verify the rest in about sixty seconds?`,
      nextStage: "voice_confirm" as SessionStage | null,
      manualReviewSuggested: false,
      controlAndManagementScore: 75,
    };
  }

  if (stage === "voice_confirm" && /yes|yeah|correct|that's me|i am|sure/i.test(last)) {
    return {
      assistantText:
        "Thank you. Please hold your government ID steady in front of the camera. I will scan it now.",
      nextStage: "vision_id" as SessionStage | null,
      manualReviewSuggested: false,
      controlAndManagementScore: 80,
    };
  }

  if (stage === "vision_id") {
    return {
      assistantText:
        "In your own words, describe your role in the daily operations of the business.",
      nextStage: "voice_attestation" as SessionStage | null,
      manualReviewSuggested: false,
      controlAndManagementScore: 82,
    };
  }

  if (stage === "voice_attestation" && last.length <= 8) {
    return {
      assistantText: "In your own words, describe your role in the daily operations of the business.",
      nextStage: null,
      manualReviewSuggested: false,
      controlAndManagementScore: 78,
    };
  }

  if (stage === "voice_attestation" && last.length > 8) {
    return {
      assistantText:
        "Verification complete. Anchoring your certificate to the QID chain now.",
      nextStage: "anchoring" as SessionStage | null,
      manualReviewSuggested: last.length < 25,
      controlAndManagementScore: 78,
    };
  }

  if (stage === "anchoring") {
    return {
      assistantText: "Your live certificate is ready. You may scan the QR code to verify.",
      nextStage: "complete" as SessionStage | null,
      manualReviewSuggested: false,
      controlAndManagementScore: 85,
    };
  }

  return {
    assistantText:
      "Please continue following the on-screen prompts. Say yes when you are the named primary owner.",
    nextStage: null,
    manualReviewSuggested: false,
    controlAndManagementScore: 70,
  };
}

function mockVisionRecord(company: RegistryCompany): Record<string, unknown> {
  return {
    nameGuess: company.primaryOwner,
    livenessHint: "ok",
    matchesPrimaryOwner: true,
    confidence: 70,
  };
}

export async function runVision(
  company: RegistryCompany,
  base64: string,
  mimeType: string,
): Promise<VisionResult> {
  const prompt = visionIdPrompt(company);

  if (!hasGeminiKey()) {
    return { data: mockVisionRecord(company), quotaFallback: false };
  }

  try {
    const run = await generateWithModelFallback([
      { text: prompt },
      { inlineData: { data: base64, mimeType: mimeType || "image/jpeg" } },
    ]);
    const text = run.text;
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const data = JSON.parse(cleaned) as Record<string, unknown>;
      return { data, quotaFallback: false, fallbackMeta: run.fallbackMeta };
    } catch {
      return {
        data: { parseError: true, raw: text.slice(0, 200) },
        quotaFallback: false,
        fallbackMeta: run.fallbackMeta,
      };
    }
  } catch (error) {
    const fallbackMeta =
      (error as { fallbackMeta?: GeminiFallbackMeta })?.fallbackMeta ??
      extractGeminiFallbackMeta(error);
    return {
      data: mockVisionRecord(company),
      quotaFallback: true,
      fallbackReason: fallbackMeta.reason,
      fallbackSubtype: fallbackMeta.quotaSubtype,
      fallbackMeta,
    };
  }
}

function mockAttestation(userText: string): AttestationResult {
  const short = userText.trim().length < 20;
  return {
    score: short ? 55 : 78,
    manualReview: short,
    rationale: short
      ? "Response was very short for a control narrative."
      : "Demo mode narrative accepted.",
    quotaFallback: false,
  };
}

export async function runAttestationAnalysis(
  company: RegistryCompany,
  userText: string,
): Promise<AttestationResult> {
  if (!hasGeminiKey()) {
    return mockAttestation(userText);
  }

  const instruction = buildAttestationInstruction(company);
  try {
    const run = await generateWithModelFallback([
      { text: instruction },
      { text: `User said: ${userText}` },
    ]);
    const text = run.text;
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const j = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        score: Number(j.controlAndManagementScore ?? 70),
        manualReview: Boolean(j.manualReviewSuggested),
        rationale: String(j.rationale ?? ""),
        quotaFallback: false,
        fallbackMeta: run.fallbackMeta,
      };
    } catch {
      return {
        score: 65,
        manualReview: true,
        rationale: "Could not parse attestation model output.",
        quotaFallback: false,
        fallbackMeta: run.fallbackMeta,
      };
    }
  } catch (error) {
    const fallbackMeta =
      (error as { fallbackMeta?: GeminiFallbackMeta })?.fallbackMeta ??
      extractGeminiFallbackMeta(error);
    const m = mockAttestation(userText);
    return {
      ...m,
      quotaFallback: true,
      fallbackReason: fallbackMeta.reason,
      fallbackSubtype: fallbackMeta.quotaSubtype,
      fallbackMeta,
    };
  }
}
