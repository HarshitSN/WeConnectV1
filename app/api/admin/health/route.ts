import { NextResponse } from "next/server";
import { getBlockchainHealth } from "@/lib/blockchain";
import {
  getGeminiModelOrder,
  hasExplicitGeminiFallbacksConfigured,
  hasGeminiKey,
} from "@/lib/gemini";
import { listCertificates, listSessions } from "@/lib/session-store";

export async function GET() {
  const sessions = listSessions();
  const certs = listCertificates();
  const now = Date.now();
  const fallbackEvents = sessions.flatMap((s) => s.geminiFallbacks ?? []);
  const recentFallbackEvents = fallbackEvents.filter((e) => {
    const at = Date.parse(e.at);
    return Number.isFinite(at) && now - at <= 15 * 60 * 1000;
  });
  const modelFallbackSuccessRecent = recentFallbackEvents.filter(
    (e) => e.reason === "model_fallback_success",
  );
  const lastModelFallbackSuccess = fallbackEvents
    .filter((e) => e.reason === "model_fallback_success")
    .slice()
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];
  const lastFallback = fallbackEvents
    .slice()
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];
  const lastCert = certs.sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt))[0];
  const lastAnchorError = sessions.find((s) => Boolean(s.lastAnchorError))?.lastAnchorError ?? null;
  return NextResponse.json({
    ai: {
      geminiKeyConfigured: hasGeminiKey(),
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      fallbackChainConfigured: hasExplicitGeminiFallbacksConfigured(),
      effectiveModelOrder: getGeminiModelOrder(),
      guardrailWarning:
        hasGeminiKey() && !hasExplicitGeminiFallbacksConfigured()
          ? "GEMINI_MODEL_FALLBACKS is empty. Built-in defaults are active."
          : null,
      degraded: recentFallbackEvents.length > 0,
      recentFallbackCount: recentFallbackEvents.length,
      recentModelFallbackSuccessCount: modelFallbackSuccessRecent.length,
      lastSuccessfulModelUsed: lastModelFallbackSuccess?.selectedModel ?? null,
      lastFallback: lastFallback
        ? {
            at: lastFallback.at,
            reason: lastFallback.reason,
            quotaSubtype: lastFallback.quotaSubtype,
            model: lastFallback.model,
            selectedModel: lastFallback.selectedModel,
            attemptedModels: lastFallback.attemptedModels,
            retryAfterSec: lastFallback.retryAfterSec,
            quotaMetric: lastFallback.quotaMetric,
            quotaId: lastFallback.quotaId,
            channel: lastFallback.channel,
          }
        : null,
    },
    chain: getBlockchainHealth(),
    stats: {
      sessions: sessions.length,
      certificates: certs.length,
      activeCertificates: certs.filter((c) => !c.revoked).length,
      manualReviewSuggested: certs.filter((c) => Boolean(c.manualReviewSuggested)).length,
    },
    lastCertificate: lastCert
      ? {
          id: lastCert.id,
          txHash: lastCert.txHash,
          revoked: lastCert.revoked,
          anchorMode: lastCert.provenanceSummary?.anchorMode ?? "demo",
          anchorKind: lastCert.provenanceSummary?.anchorKind ?? "tx_data",
        }
      : null,
    lastAnchorError,
  });
}
