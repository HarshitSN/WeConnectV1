"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyRegistrationDraft,
  type FieldSource,
  type RegistrationDraft,
  validateRegistration,
} from "@/lib/registration";
import { BlockAnchorAnimation } from "./BlockAnchorAnimation";
import { CertificateCard, type CertDisplay } from "./CertificateCard";
import { TerminalFeed } from "./TerminalFeed";
import { VoiceConcierge } from "./VoiceConcierge";
import { WebcamCapture } from "./WebcamCapture";

type Match = {
  id: string;
  companyName: string;
  jurisdiction: string;
  registrySnippet: string;
  primaryOwner: string;
  ownershipFemalePct?: number | null;
  ownerPrefillPct?: number | null;
};

function speak(text: string) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[TTS] speechSynthesis unavailable");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch (error) {
    console.warn("[TTS] failed to speak", error);
  }
}

type AgentJson = {
  assistantText?: string;
  stage?: string;
  uiHints?: { badge?: string | null };
  quotaFallback?: boolean;
  fallbackReason?: "quota" | "api_key_invalid" | "model_not_found" | "permission" | "network" | "unknown";
  fallbackSubtype?: "capacity" | "quota";
  error?: string;
};

type GeminiFallbackReason =
  | "quota"
  | "api_key_invalid"
  | "model_not_found"
  | "permission"
  | "network"
  | "unknown";
type GeminiQuotaSubtype = "capacity" | "quota";

function fallbackReasonCopy(reason: GeminiFallbackReason | null, subtype: GeminiQuotaSubtype | null) {
  switch (reason) {
    case "quota":
      if (subtype === "capacity") return "Gemini model capacity is temporarily exhausted.";
      return "Gemini quota/rate limit was hit.";
    case "api_key_invalid":
      return "Gemini API key is missing or invalid.";
    case "model_not_found":
      return "Configured Gemini model name is unavailable.";
    case "permission":
      return "Gemini request was denied by permissions.";
    case "network":
      return "Network/provider issue reaching Gemini.";
    default:
      return "Gemini live call failed.";
  }
}

function fallbackReasonGuidance(reason: GeminiFallbackReason | null, subtype: GeminiQuotaSubtype | null) {
  switch (reason) {
    case "api_key_invalid":
      return "Set a valid GEMINI_API_KEY in .env.local and restart the server.";
    case "model_not_found":
      return "Update GEMINI_MODEL to an available model from Google AI Studio.";
    case "permission":
      return "Check API key permissions and project access for the selected Gemini model.";
    case "quota":
      if (subtype === "capacity") {
        return "Current model is at capacity. Retry shortly or configure model fallbacks with available capacity.";
      }
      return "Quota/rate limit reached. Retry later or switch to a model/tier with capacity.";
    case "network":
      return "Provider/network issue. Verify internet/proxy/DNS, then retry.";
    default:
      return "Review GEMINI_API_KEY and GEMINI_MODEL in .env.local.";
  }
}

type AnchorJson = {
  certificate?: CertDisplay & { revoked: boolean };
  blockers?: string[];
  error?: string;
  reasonCode?:
    | "config_invalid"
    | "rpc_unreachable"
    | "network_timeout"
    | "insufficient_funds"
    | "tx_reverted"
    | "tx_rejected"
    | "receipt_invalid"
    | "unknown";
  reasonDetail?: string;
  operatorHint?: string;
  anchorMode?: "real" | "demo";
  anchorFallbackReason?: string;
};

type DiscoverJson = {
  ok: boolean;
  source?: "registry" | "web";
  provider?: "google_serpapi" | "duckduckgo";
  fallbackReason?: string;
  lowConfidence?: boolean;
  match?: Match;
  message?: string;
  candidates?: Array<{ title: string; snippet: string; url: string; domain?: string; score?: number }>;
  enrichmentSummary?: {
    legalName?: string;
    country?: string;
    ownerName?: string;
    industryHint?: string;
  };
  classificationSummary?: {
    naics?: { sourceType?: "authoritative" | "serp_explicit" | "inferred" | "unresolved"; confidence?: number };
    unspsc?: { sourceType?: "authoritative" | "serp_explicit" | "inferred" | "unresolved"; confidence?: number };
  };
  prefill?: RegistrationDraft;
  fieldConfidence?: Partial<Record<keyof RegistrationDraft, number>>;
  fieldSource?: Partial<Record<keyof RegistrationDraft, FieldSource>>;
  evidence?: Partial<Record<keyof RegistrationDraft, string>>;
  missingRequired?: string[];
  selectedCandidateIndex?: number;
  ownershipEvidenceConfidence?: number;
  countryRequiresConfirmation?: boolean;
};

async function parseJsonSafe<T>(r: Response): Promise<{
  ok: boolean;
  data?: T;
  errorMessage?: string;
}> {
  const raw = await r.text();
  if (!raw.trim()) {
    return {
      ok: r.ok,
      errorMessage: r.ok ? undefined : `Empty response (HTTP ${r.status})`,
    };
  }
  try {
    const data = JSON.parse(raw) as T;
    if (!r.ok) {
      const err = (data as { error?: string }).error ?? `Request failed (HTTP ${r.status})`;
      return { ok: false, data, errorMessage: err };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      errorMessage: `Invalid response (HTTP ${r.status}). Expected JSON.`,
    };
  }
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, retries = 1): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("network error");
}

export function ConciergeClient({ embed }: { embed?: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [query, setQuery] = useState("Global Tech Solutions");
  const [match, setMatch] = useState<Match | null>(null);
  const [stage, setStage] = useState<string>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [assistant, setAssistant] = useState<string>("");
  const [badge, setBadge] = useState<string | null>(null);
  const [cert, setCert] = useState<CertDisplay | null>(null);
  const [scanning, setScanning] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [pendingTx, setPendingTx] = useState<string | undefined>();
  const [visionNote, setVisionNote] = useState<string>("");
  const [visionWarning, setVisionWarning] = useState<string>("");
  const [quotaFallbackNotice, setQuotaFallbackNotice] = useState(false);
  const [quotaFallbackReason, setQuotaFallbackReason] = useState<GeminiFallbackReason | null>(null);
  const [quotaFallbackSubtype, setQuotaFallbackSubtype] = useState<GeminiQuotaSubtype | null>(null);
  const [registration, setRegistration] = useState<RegistrationDraft>(emptyRegistrationDraft());
  const [fieldConfidence, setFieldConfidence] = useState<
    Partial<Record<keyof RegistrationDraft, number>>
  >({});
  const [fieldSource, setFieldSource] = useState<Partial<Record<keyof RegistrationDraft, FieldSource>>>(
    {},
  );
  const [paid, setPaid] = useState(false);
  const [discoverCandidates, setDiscoverCandidates] = useState<
    Array<{ title: string; snippet: string; url: string; domain?: string; score?: number }>
  >([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [needsCandidateConfirmation, setNeedsCandidateConfirmation] = useState(false);
  const [countryConfirmed, setCountryConfirmed] = useState(true);
  const [countryRequiresConfirmation, setCountryRequiresConfirmation] = useState(false);
  const [ownershipEvidenceConfidence, setOwnershipEvidenceConfidence] = useState(0);
  const [visionBlockers, setVisionBlockers] = useState<string[]>([]);
  const [anchorBlockers, setAnchorBlockers] = useState<string[]>([]);
  const [anchorFailureReason, setAnchorFailureReason] = useState<string>("");
  const [anchorOperatorHint, setAnchorOperatorHint] = useState<string>("");
  const [visionChecks, setVisionChecks] = useState<{
    idPassed?: boolean;
  }>({});
  const linesSigRef = useRef("");
  const [fieldEvidence, setFieldEvidence] = useState<Partial<Record<keyof RegistrationDraft, string>>>(
    {},
  );
  const [classificationSummary, setClassificationSummary] = useState<
    DiscoverJson["classificationSummary"] | undefined
  >(undefined);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const refreshSession = useCallback(async (sid: string) => {
    const r = await fetch(`/api/session?id=${sid}`);
    if (!r.ok) {
      if (r.status === 404) {
        setPollingEnabled(false);
        setAssistant("Session expired or reset. Please refresh to start a new verification session.");
      }
      return;
    }
    const j = (await r.json()) as {
      terminalLines?: string[];
      stage?: string;
      registration?: RegistrationDraft;
      paid?: boolean;
      visionChecks?: { idPassed?: boolean };
    };
    if (j.terminalLines) {
      const nextSig = `${j.terminalLines.length}:${j.terminalLines[j.terminalLines.length - 1] ?? ""}`;
      if (linesSigRef.current !== nextSig) {
        linesSigRef.current = nextSig;
        setLines(j.terminalLines);
      }
    }
    if (j.stage && j.stage !== stage) setStage(j.stage);
    if (j.registration && JSON.stringify(j.registration) !== JSON.stringify(registration)) {
      setRegistration(j.registration);
    }
    const nextPaid = Boolean(j.paid);
    if (nextPaid !== paid) setPaid(nextPaid);
    if (
      j.visionChecks &&
      j.visionChecks.idPassed !== visionChecks.idPassed
    ) {
      setVisionChecks(j.visionChecks);
    }
  }, [stage, registration, paid, visionChecks.idPassed]);

  const saveRegistration = useCallback(
    async (nextRegistration: RegistrationDraft, nextPaid: boolean) => {
      if (!sessionId) return;
      await fetch("/api/session/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, registration: nextRegistration, paid: nextPaid }),
      });
    },
    [sessionId],
  );

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/session", { method: "POST" });
      const parsed = await parseJsonSafe<{ sessionId: string }>(r);
      if (parsed.ok && parsed.data?.sessionId) {
        setPollingEnabled(true);
        setSessionId(parsed.data.sessionId);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId || !pollingEnabled) return;
    const t = setInterval(() => void refreshSession(sessionId), 2500);
    return () => clearInterval(t);
  }, [sessionId, pollingEnabled, refreshSession]);

  const runDiscover = async (
    candidateIndex = selectedCandidateIndex,
    confirmedSelection = false,
  ) => {
    if (!sessionId) return;
    const r = await fetchWithRetry("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, query, selectedCandidateIndex: candidateIndex }),
    });
    const parsed = await parseJsonSafe<DiscoverJson>(r);
    if (!parsed.ok || !parsed.data) {
      setAssistant(parsed.errorMessage ?? "Discovery failed.");
      return;
    }
    const j = parsed.data;
    await refreshSession(sessionId);
    if (!j.ok || !j.match) {
      setMatch(null);
      setAssistant(j.message ?? "No match.");
      speak(j.message ?? "No match in the demo registry.");
      return;
    }
    setMatch(j.match);
    setRegistration(j.prefill ?? emptyRegistrationDraft());
    setFieldConfidence(j.fieldConfidence ?? {});
    setFieldSource(j.fieldSource ?? {});
    setFieldEvidence(j.evidence ?? {});
    setDiscoverCandidates(j.candidates ?? []);
    setSelectedCandidateIndex(candidateIndex);
    setNeedsCandidateConfirmation(Boolean(j.source === "web" && j.lowConfidence && !confirmedSelection));
    setCountryRequiresConfirmation(Boolean(j.countryRequiresConfirmation));
    setCountryConfirmed(!Boolean(j.countryRequiresConfirmation));
    setOwnershipEvidenceConfidence(Number(j.ownershipEvidenceConfidence ?? 0));
    setClassificationSummary(j.classificationSummary);
    setPaid(false);
    setAssistant(
      j.source === "web"
        ? `I found a live ${j.provider === "google_serpapi" ? "Google" : "web"} result for ${
            j.match.companyName
          }. I prefilled what I could, and we'll confirm the rest.`
        : `I've found ${j.match.companyName} in ${j.match.jurisdiction}. Primary owner on file: ${j.match.primaryOwner}.`,
    );
    if (j.source === "web") {
      const fallbackNote =
        j.provider === "duckduckgo" && j.fallbackReason
          ? ` (fallback: ${j.fallbackReason})`
          : "";
      setBadge(`DISCOVERY SOURCE · ${j.provider === "google_serpapi" ? "Google SerpApi" : "DuckDuckGo"}${fallbackNote}`);
      if (j.lowConfidence) {
        setAssistant(
          `I found multiple possible matches for ${j.match.companyName}. Please choose the best candidate before continuing.`,
        );
        setBadge("DISCOVERY REVIEW · candidate confirmation required");
      }
    }
    if (j.source === "web" && j.lowConfidence && !confirmedSelection) {
      speak(`I found multiple matches for ${j.match.companyName}. Please confirm the best candidate.`);
    } else {
      speak(
        `I found ${j.match.companyName}. Primary owner on file: ${j.match.primaryOwner}. Ready to verify?`,
      );
    }
  };

  const callAgent = async (userText?: string, mode?: "dialogue" | "attestation") => {
    if (!sessionId) return;
    const r = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userText: userText ?? "", mode }),
    });
    const parsed = await parseJsonSafe<AgentJson>(r);
    if (!parsed.ok || !parsed.data?.assistantText) {
      setAssistant(
        parsed.errorMessage ??
          "The verification service returned an error. Check the terminal or try again.",
      );
      return undefined;
    }
    const j = parsed.data;
    if (j.quotaFallback) {
      setQuotaFallbackNotice(true);
      setQuotaFallbackReason(j.fallbackReason ?? "unknown");
      setQuotaFallbackSubtype(j.fallbackSubtype ?? null);
    }
    setAssistant(j.assistantText ?? "");
    if (j.stage) setStage(j.stage);
    if (j.uiHints?.badge) setBadge(j.uiHints.badge);
    await refreshSession(sessionId);
    speak(j.assistantText ?? "");
    return j;
  };

  const startVerification = async () => {
    if (needsCandidateConfirmation) {
      const message =
        "Please select the best web candidate and click 'Use selected candidate' before starting verification.";
      setAssistant(message);
      speak(message);
      return;
    }
    if (!registration.country.trim()) {
      const message = "Country is required before verification. Please enter and confirm the country.";
      setAssistant(message);
      speak(message);
      return;
    }
    if (countryRequiresConfirmation && !countryConfirmed) {
      const message = "Please confirm the country field before starting verification.";
      setAssistant(message);
      speak(message);
      return;
    }
    await saveRegistration(registration, paid);
    await callAgent();
  };

  const onVoice = async (text: string) => {
    if (stage === "voice_attestation") {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userText: text, mode: "attestation" }),
      });
      const parsed = await parseJsonSafe<AgentJson>(r);
      if (!parsed.ok || !parsed.data?.assistantText) {
        setAssistant(parsed.errorMessage ?? "Attestation step failed.");
        return;
      }
      const j = parsed.data;
      if (j.quotaFallback) {
        setQuotaFallbackNotice(true);
        setQuotaFallbackReason(j.fallbackReason ?? "unknown");
        setQuotaFallbackSubtype(j.fallbackSubtype ?? null);
      }
      setAssistant(j.assistantText ?? "");
      if (j.stage) setStage(j.stage);
      await refreshSession(sessionId!);
      speak(j.assistantText ?? "");
      return;
    }
    await callAgent(text);
  };

  const anchorCert = useCallback(async () => {
    if (!sessionId) return;
    setAnchoring(true);
    setAnchorBlockers([]);
    setAnchorFailureReason("");
    setAnchorOperatorHint("");
    setPendingTx("0x…pending");
    try {
      await saveRegistration(registration, paid);
      const r = await fetch("/api/certificate/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const parsed = await parseJsonSafe<AnchorJson>(r);
      if (!parsed.ok || !parsed.data) {
        const data = parsed.data;
        setAnchorBlockers(Array.from(new Set(data?.blockers ?? [])));
        setAnchorFailureReason(
          data?.reasonCode
            ? `${data.error ?? "Anchoring failed"} (${data.reasonCode})`
            : (data?.error ?? parsed.errorMessage ?? "Anchoring failed."),
        );
        setAnchorOperatorHint(data?.operatorHint ?? (data?.reasonDetail ? `Details: ${data.reasonDetail}` : ""));
        return;
      }
      const j = parsed.data;
      if (j.anchorMode === "demo" && j.anchorFallbackReason) {
        setBadge(`CHAIN FALLBACK · demo (${j.anchorFallbackReason})`);
      } else if (j.anchorMode === "real") {
        setBadge("CHAIN MODE · Base Sepolia confirmed");
      }
      if (j.certificate) {
        setCert({ ...j.certificate, revoked: j.certificate.revoked });
        setStage("complete");
        await refreshSession(sessionId);
        speak("Verification complete. Your certificate is ready.");
      }
    } catch {
      setAnchorFailureReason("Could not issue certificate. Please retry.");
    } finally {
      setAnchoring(false);
      setPendingTx(undefined);
    }
  }, [sessionId, refreshSession, registration, paid, saveRegistration]);

  const sendVision = async (dataUrl: string) => {
    if (!sessionId) return;
    setScanning(true);
    setVisionNote("");
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch?.[1] || "video/webm";
    const r = await fetchWithRetry("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, videoBase64: dataUrl, mimeType, task: "id" }),
    });
    const parsed = await parseJsonSafe<{
      result?: Record<string, unknown>;
      stage?: string;
      confidence?: number;
      blockers?: string[];
      visionNameMatchBypassed?: boolean;
      warningCode?: string;
      quotaFallback?: boolean;
      fallbackReason?: GeminiFallbackReason;
      fallbackSubtype?: GeminiQuotaSubtype;
    }>(r);
    setScanning(false);
    if (!parsed.ok || !parsed.data) {
      setAssistant(parsed.errorMessage ?? "Vision request failed.");
      await refreshSession(sessionId);
      return;
    }
    const j = parsed.data;
    if (j.quotaFallback) {
      setQuotaFallbackNotice(true);
      setQuotaFallbackReason(j.fallbackReason ?? "unknown");
      setQuotaFallbackSubtype(j.fallbackSubtype ?? null);
    }
    await refreshSession(sessionId);
    if (j.stage) setStage(j.stage);
    setVisionBlockers(j.blockers ?? []);
    if (j.visionNameMatchBypassed) {
      setVisionWarning(
        "Owner identity was not available from source; verification continued with warning.",
      );
    } else {
      setVisionWarning("");
    }
    const conf = Number(j.confidence ?? 0);
    setBadge(
      j.result?.matchesPrimaryOwner || j.visionNameMatchBypassed
        ? `ID VIDEO VERIFIED · pass (conf ${conf})`
        : `ID VIDEO REVIEW · manual review suggested (conf ${conf})`,
    );
    if (j.stage === "voice_attestation") {
      setVisionNote("ID video verified. Ownership remains prefill-derived and not vision-verified.");
      const prompt =
        "ID verification complete. Please describe your role in the daily operations of the business.";
      setAssistant(prompt);
      speak(prompt);
    }
  };

  const verifyUrl =
    typeof window !== "undefined" && cert
      ? `${window.location.origin}/verify/${cert.id}`
      : "";
  const registrationCheck = validateRegistration(registration, paid);
  const naicsSourceType = classificationSummary?.naics?.sourceType ?? "unresolved";
  const unspscSourceType = classificationSummary?.unspsc?.sourceType ?? "unresolved";
  const toBadge = (sourceType: string, confidence?: number) => {
    const label =
      sourceType === "authoritative"
        ? "Authoritative"
        : sourceType === "serp_explicit"
          ? "SERP explicit"
          : sourceType === "inferred"
            ? "Inferred"
            : "Needs confirmation";
    return `${label}${typeof confidence === "number" ? ` · ${confidence}%` : ""}`;
  };
  const readinessBlockers = [
    ...registrationCheck.missingRequired,
    ...(visionChecks.idPassed ? [] : ["vision_id"]),
  ];
  const countryConfirmationBlockers =
    countryRequiresConfirmation && !countryConfirmed ? ["country_confirmation"] : [];
  const mergedBlockers = Array.from(
    new Set([...readinessBlockers, ...countryConfirmationBlockers, ...anchorBlockers]),
  );
  const readinessForIssue = mergedBlockers.length === 0;
  const mockCardValid =
    cardNumber.replace(/\s+/g, "").length >= 12 && cardExpiry.trim().length >= 4 && cardCvv.length >= 3;
  const flowSteps = ["Discover", "Confirm", "Voice", "Vision", "Payment", "Certificate"] as const;
  const currentFlowStep = (() => {
    if (cert || stage === "complete") return 5;
    if (stage === "anchoring" || (paid && !readinessForIssue)) return 4;
    if (paid && readinessForIssue) return 5;
    if (stage === "voice_attestation" || stage === "vision_id" || visionChecks.idPassed) return 3;
    if (stage === "voice_confirm" || stage === "discovered") return 2;
    if (match) return 1;
    return 0;
  })();
  const paymentUnlocked =
    stage === "voice_attestation" || stage === "anchoring" || stage === "complete" || Boolean(cert);
  const nextAction = (() => {
    if (!sessionId) {
      return {
        title: "Preparing your session…",
        detail: "Please wait a moment.",
      };
    }
    if (!match) {
      return {
        title: "Step 1: Enter business name and click Discover.",
        detail: "Example: Arby's, StatusNeo, Nile Logistics.",
      };
    }
    if (needsCandidateConfirmation) {
      return {
        title: "Step 2: Confirm the right company candidate.",
        detail: "Pick the best match under Top web candidates and click Use selected candidate.",
      };
    }
    if (!registration.country.trim()) {
      return {
        title: "Step 2: Enter country.",
        detail: "Type country and confirm it before starting verification.",
      };
    }
    if (countryRequiresConfirmation && !countryConfirmed) {
      return {
        title: "Step 2: Confirm country.",
        detail: "Click Confirm country to continue.",
      };
    }
    if (stage === "discovered" || stage === "voice_confirm") {
      return {
        title: "Step 3: Start voice verification.",
        detail: "Click Start 60-second verification, then say yes.",
      };
    }
    if (stage === "vision_id") {
      return {
        title: "Step 4: Complete ID video.",
        detail: scanning
          ? "Analyzing your clip… please wait."
          : "Open camera and record a 2-second clip. Keep face and ID steady.",
      };
    }
    if (stage === "voice_attestation") {
      return {
        title: "Step 5: Explain your role.",
        detail: "Use Speak or Type box and describe your daily operational role.",
      };
    }
    if (!paid) {
      return {
        title: "Step 6: Complete payment gate.",
        detail: "Enter mock card details and mark payment as verified.",
      };
    }
    if (!readinessForIssue) {
      return {
        title: "Almost done: clear blockers before issuing certificate.",
        detail: `Pending: ${mergedBlockers.join(", ")}`,
      };
    }
    if (stage === "anchoring") {
      return {
        title: "Finalizing certificate…",
        detail: "Anchoring is in progress.",
      };
    }
    return {
      title: "Step 6: Issue certificate.",
      detail: "Click Issue certificate to anchor and finish.",
    };
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
      <BlockAnchorAnimation active={anchoring} txHash={pendingTx} />

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        {!embed && (
          <header className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
            <span className="text-zinc-400">WEC-Guardian · demonstration only</span>
            <div className="flex gap-3">
              <Link href="/admin" className="text-cyan-400 hover:underline">
                Admin
              </Link>
              <Link href="/demo" className="text-cyan-400 hover:underline">
                Split demo
              </Link>
            </div>
          </header>
        )}

        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          Demonstration only — not legal identity verification. Uses a static demo registry and
          testnet/demo anchoring modes.
        </p>
        {quotaFallbackNotice && (
          <p className="rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 text-xs text-violet-200/95">
            {fallbackReasonCopy(quotaFallbackReason, quotaFallbackSubtype)} Continuing in{" "}
            <strong className="font-medium">demo mode</strong>.{" "}
            {fallbackReasonGuidance(quotaFallbackReason, quotaFallbackSubtype)}
          </p>
        )}
        <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold text-cyan-100">Guided Flow</p>
          <p className="mt-1 text-sm text-cyan-50">{nextAction.title}</p>
          <p className="mt-1 text-xs text-cyan-200/80">{nextAction.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {flowSteps.map((step, index) => (
              <span
                key={step}
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  index < currentFlowStep
                    ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                    : index === currentFlowStep
                      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                      : "border-white/10 bg-black/20 text-zinc-400"
                }`}
              >
                {index + 1}. {step}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Proactive intake</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enter a business name or URL. Try <strong className="text-zinc-200">Global Tech Solutions</strong>
            , Nile Logistics, or Red Sand Trading.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name or URL"
            />
            <button
              type="button"
              onClick={() => void runDiscover()}
              disabled={!sessionId}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              Discover
            </button>
          </div>
          {match && (
            <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm">
              <p className="font-medium text-emerald-200">{match.companyName}</p>
              <p className="text-zinc-400">{match.registrySnippet}</p>
              <p className="mt-2 text-zinc-300">
                Primary owner: <span className="text-white">{match.primaryOwner}</span> · Female
                ownership (filed, prefill only):{" "}
                <span className="text-emerald-400">
                  {typeof match.ownershipFemalePct === "number" && ownershipEvidenceConfidence > 0
                    ? `${match.ownershipFemalePct}%`
                    : "Unknown (awaiting evidence)"}
                </span>
              </p>
              <p className="mt-1 text-zinc-300">
                Primary owner share (prefill, unverified):{" "}
                <span className="text-amber-300">
                  {typeof match.ownerPrefillPct === "number" ? `${match.ownerPrefillPct}%` : "Unknown"}
                </span>
              </p>
              <button
                type="button"
                onClick={() => void startVerification()}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Start 60-second verification
              </button>
              {needsCandidateConfirmation ? (
                <p className="mt-2 text-xs text-amber-300">
                  Candidate confirmation required before verification can start.
                </p>
              ) : null}
              {countryRequiresConfirmation && !countryConfirmed ? (
                <p className="mt-2 text-xs text-amber-300">
                  Country confirmation required before verification can start.
                </p>
              ) : null}
            </div>
          )}
          {match && (
            <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm">
              <p className="font-medium text-cyan-100">Prefill review (editable)</p>
              <p className="mt-1 text-xs text-zinc-400">
                Fetched from registry/web. Voice now focuses on unresolved fields and confirmations.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-zinc-300">
                  Business name
                  <input
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.business_name}
                    onChange={(e) =>
                      setRegistration((prev) => ({ ...prev, business_name: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-zinc-300">
                  Country
                  <input
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.country}
                    onChange={(e) => {
                      const next = e.target.value;
                      setRegistration((prev) => ({ ...prev, country: next }));
                      if (countryRequiresConfirmation) {
                        setCountryConfirmed(false);
                      }
                    }}
                  />
                  {countryRequiresConfirmation ? (
                    <button
                      type="button"
                      onClick={() => setCountryConfirmed(Boolean(registration.country.trim()))}
                      className="mt-1 rounded border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-200"
                    >
                      {countryConfirmed ? "Country confirmed" : "Confirm country"}
                    </button>
                  ) : null}
                </label>
                <label className="text-xs text-zinc-300">
                  NAICS codes (comma separated)
                  <input
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.naics_codes.join(", ")}
                    onChange={(e) =>
                      setRegistration((prev) => ({
                        ...prev,
                        naics_codes: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-zinc-300">
                  UNSPSC codes (comma separated)
                  <input
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.unspsc_codes.join(", ")}
                    onChange={(e) =>
                      setRegistration((prev) => ({
                        ...prev,
                        unspsc_codes: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-zinc-300">
                  Cert type
                  <select
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.cert_type}
                    onChange={(e) =>
                      setRegistration((prev) => ({ ...prev, cert_type: e.target.value }))
                    }
                  >
                    <option value="">Select certification type</option>
                    <option value="self">Self certification</option>
                    <option value="digital">Digital certification</option>
                  </select>
                </label>
                <label className="text-xs text-zinc-300">
                  Primary owner % (must total 100)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.owner_details[0]?.ownershipPct ?? 0}
                    onChange={(e) =>
                      setRegistration((prev) => ({
                        ...prev,
                        owner_details: [
                          {
                            fullName: prev.owner_details[0]?.fullName || match.primaryOwner,
                            gender: prev.owner_details[0]?.gender || "Female",
                            ownershipPct: Number(e.target.value || 0),
                          },
                        ],
                      }))
                    }
                  />
                </label>
              </div>
              <label className="mt-2 block text-xs text-zinc-300">
                Business description (min 30 chars)
                <textarea
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                  rows={3}
                  value={registration.business_description}
                  onChange={(e) =>
                    setRegistration((prev) => ({ ...prev, business_description: e.target.value }))
                  }
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                <span>
                  Source business_name: {fieldSource.business_name ?? "manual"} ·{" "}
                  {fieldConfidence.business_name ?? 0}%
                </span>
                <span>
                  Source country: {fieldSource.country ?? "manual"} · {fieldConfidence.country ?? 0}%
                </span>
                <span>
                  NAICS classification: {toBadge(naicsSourceType, classificationSummary?.naics?.confidence)}
                </span>
                <span>
                  UNSPSC classification: {toBadge(unspscSourceType, classificationSummary?.unspsc?.confidence)}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                {fieldEvidence.business_name ? <p>Business name evidence: {fieldEvidence.business_name}</p> : null}
                {fieldEvidence.country ? <p>Country evidence: {fieldEvidence.country}</p> : null}
                {fieldEvidence.owner_details ? <p>Owner evidence: {fieldEvidence.owner_details}</p> : null}
                {fieldEvidence.naics_codes ? <p>NAICS evidence: {fieldEvidence.naics_codes}</p> : null}
                {fieldEvidence.unspsc_codes ? <p>UNSPSC evidence: {fieldEvidence.unspsc_codes}</p> : null}
                {fieldEvidence.business_description ? (
                  <p>Description evidence: {fieldEvidence.business_description}</p>
                ) : null}
              </div>
              {!!discoverCandidates.length && (
                <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2 text-[11px] text-zinc-400">
                  <p className="text-zinc-300">Top web candidates</p>
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]"
                      value={selectedCandidateIndex}
                      onChange={(e) => setSelectedCandidateIndex(Number(e.target.value))}
                    >
                      {discoverCandidates.slice(0, 3).map((c, idx) => (
                        <option key={`${c.url}-${idx}`} value={idx}>
                          {idx + 1}. {c.title} ({c.score ?? 0})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void runDiscover(selectedCandidateIndex, true)}
                      className="rounded border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-200"
                    >
                      Use selected candidate
                    </button>
                  </div>
                  {discoverCandidates.slice(0, 3).map((c) => (
                    <p key={`${c.url}-${c.title}`}>
                      {c.title} {c.domain ? `(${c.domain})` : ""} [{c.score ?? 0}] - {c.snippet.slice(0, 90)}
                    </p>
                  ))}
                </div>
              )}
              {!!registrationCheck.missingRequired.length && (
                <p className="mt-2 text-xs text-amber-300">
                  Missing/unverified: {registrationCheck.missingRequired.join(", ")}
                </p>
              )}
              {!!mergedBlockers.length && (
                <p className="mt-2 text-xs text-amber-400">
                  Readiness blockers: {mergedBlockers.join(", ")}
                </p>
              )}
              {anchorFailureReason ? (
                <p className="mt-2 text-xs text-rose-300">Anchor response: {anchorFailureReason}</p>
              ) : null}
              {anchorOperatorHint ? (
                <p className="mt-2 text-xs text-amber-300">Anchor action: {anchorOperatorHint}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void saveRegistration(registration, paid)}
                className="mt-3 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10"
              >
                Save prefill edits
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Voice · Vision</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-cyan-100/90">{assistant || "…"}</p>
          {badge && (
            <p className="mt-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 font-mono text-xs text-cyan-200">
              {badge}
            </p>
          )}
          {visionNote ? (
            <p className="mt-2 text-xs text-zinc-500">Vision summary: {visionNote}</p>
          ) : null}
          {visionWarning ? (
            <p className="mt-2 text-xs text-amber-300">Vision warning: {visionWarning}</p>
          ) : null}
          {!!visionBlockers.length && (
            <p className="mt-2 text-xs text-amber-300">Vision blockers: {visionBlockers.join(", ")}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <VoiceConcierge
              onTranscript={(t) => void onVoice(t)}
              disabled={!sessionId || !match || stage === "complete"}
            />
            <span className="text-xs text-zinc-500">Stage: {stage}</span>
          </div>

          {stage === "vision_id" && (
            <div className="mt-6">
              <WebcamCapture
                scanning={scanning}
                label="Record ID clip (2s)"
                onCapture={(dataUrl) => void sendVision(dataUrl)}
              />
            </div>
          )}
        </section>

        {cert && (
          <CertificateCard cert={cert} verifyUrl={verifyUrl || `/verify/${cert.id}`} />
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Payment and final gate</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Demo payment required before complete registration can anchor.
          </p>
          {!paymentUnlocked && (
            <p className="mt-2 text-xs text-amber-300">
              Payment unlocks after voice + vision steps are completed.
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              placeholder="Card number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              disabled={!paymentUnlocked}
            />
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              placeholder="MM/YY"
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
              disabled={!paymentUnlocked}
            />
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              placeholder="CVV"
              value={cardCvv}
              onChange={(e) => setCardCvv(e.target.value)}
              disabled={!paymentUnlocked}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={paid}
              disabled={!paymentUnlocked || !mockCardValid}
              onChange={(e) => {
                const nextPaid = e.target.checked;
                setPaid(nextPaid);
                void saveRegistration(registration, nextPaid);
              }}
            />
            Mark payment as verified (demo)
          </label>
          {!mockCardValid && (
            <p className="mt-2 text-xs text-zinc-500">Enter valid mock card details to enable payment.</p>
          )}
          {!!anchorBlockers.length && (
            <p className="mt-2 text-xs text-rose-300">
              Anchor blocked by server: {Array.from(new Set(anchorBlockers)).join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              if (!readinessForIssue) {
                const pending = mergedBlockers.join(", ");
                const message = `Cannot issue certificate yet. Pending: ${pending}`;
                setAssistant(message);
                speak(message);
                return;
              }
              setStage("anchoring");
              void anchorCert();
            }}
            disabled={anchoring || Boolean(cert)}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {anchoring ? "Issuing certificate…" : cert ? "Certificate issued" : "Issue certificate"}
          </button>
        </section>
      </main>

      <aside className="w-full shrink-0 lg:w-80">
        <TerminalFeed lines={lines} />
        <p className="mt-3 text-[10px] text-zinc-600">
          Session: {sessionId?.slice(0, 8) ?? "…"}… · Polls server for live lines (demo).
        </p>
        <p className="mt-1 text-[10px] text-zinc-700">
          Frequent <code className="font-mono">/api/session</code> entries are heartbeat polls every 2.5s.
        </p>
      </aside>
    </div>
  );
}
