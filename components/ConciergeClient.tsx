"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyRegistrationDraft,
  type FieldSource,
  type RegistrationDraft,
  validateRegistration,
} from "@/lib/registration";
import { trustLevelLabel, type CertificationType, type ComplianceResult, type TrustReport } from "@/lib/domains/contracts";
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

type OwnershipSummary = {
  value?: number;
  sourceType?: "exact_exchange_filing" | "web_inferred" | "registry_prefill";
  confidence?: number;
  asOfDate?: string;
  sourceUrl?: string;
};

type OwnershipBreakdown = {
  ownership_total_promoter_pct?: number;
  ownership_total_public_pct?: number;
  ownership_breakdown?: Array<{ category: string; pct: number }>;
  as_of_date?: string;
  source_url?: string;
  source_type?: "exchange_filing";
  exchange?: "NSE" | "BSE";
  symbol?: string;
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
    companyType?: string;
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
  ownership?: OwnershipSummary;
  ownershipBreakdown?: OwnershipBreakdown;
  ownershipSourceType?: "exact_exchange_filing" | "web_inferred" | "registry_prefill";
  ownershipConfidence?: number;
};

function humanizeMissingField(field: string): string {
  const map: Record<string, string> = {
    business_name: "business name",
    country: "country",
    naics_codes: "NAICS codes",
    unspsc_codes: "UNSPSC codes",
    owner_details: "owner details",
    business_description: "business description",
    cert_type: "certification type",
  };
  return map[field] ?? field.replace(/_/g, " ");
}

type WorkflowState = {
  trustLevel: "self_declared" | "self_certified" | "digitally_certified";
  certificationType: CertificationType;
  certificationStage: string;
  verificationStatus: "pending" | "running" | "passed" | "manual_review" | "failed";
  payment: {
    state: "not_started" | "hold_placed" | "captured" | "refunded";
    amountUsd: number;
    holdAt?: string;
    captureAt?: string;
    refundAt?: string;
  };
  questionnaireAnswers: Record<string, string>;
  compliance?: ComplianceResult;
  trustReport?: TrustReport;
  governance: {
    roles: Array<"supplier" | "buyer" | "admin">;
    notifications: string[];
    auditTrail: string[];
    validTill?: string;
    continuouslyMonitored: boolean;
  };
};

type BuyerFlowRow = {
  supplier: {
    id: string;
    business_name: string;
    country: string;
    cert_type: "none" | "self" | "digital" | "auditor";
    cert_status: string;
    trust_score: number;
  };
  profile: {
    trustLevel: "self_declared" | "self_certified" | "digitally_certified";
    trustScore: number;
    riskLevel: "low" | "medium" | "high";
    lastVerified: string;
  };
  match: {
    matchScore: number;
    certificationPriority: number;
    rankReason: string;
  };
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
  const [isVerifyingDocs, setIsVerifyingDocs] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
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
  const [ownership, setOwnership] = useState<OwnershipSummary | null>(null);
  const [ownershipBreakdown, setOwnershipBreakdown] = useState<OwnershipBreakdown | null>(null);
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
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [trustReport, setTrustReport] = useState<TrustReport | null>(null);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<Record<string, string>>({
    ownership_control: "",
    operational_involvement: "",
    years_in_business: "",
    clients_worked_with: "",
    product_scale: "",
  });
  const [buyerQuery, setBuyerQuery] = useState("Women-owned textile suppliers in India");
  const [buyerLoading, setBuyerLoading] = useState(false);
  const [buyerRows, setBuyerRows] = useState<BuyerFlowRow[]>([]);
  const [buyerRecommendations, setBuyerRecommendations] = useState<BuyerFlowRow[]>([]);
  const [buyerSelectedId, setBuyerSelectedId] = useState<string | null>(null);
  const [journeyMode, setJourneyMode] = useState<"supplier" | "buyer">("supplier");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const lastAutosavedSessionIdRef = useRef<string | null>(null);
  const lastAutosavedPayloadRef = useRef<string>("");

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
      workflow?: WorkflowState;
    };
    if (j.terminalLines) {
      const nextSig = `${j.terminalLines.length}:${j.terminalLines[j.terminalLines.length - 1] ?? ""}`;
      if (linesSigRef.current !== nextSig) {
        linesSigRef.current = nextSig;
        setLines(j.terminalLines);
      }
    }
    if (j.stage && j.stage !== stage) setStage(j.stage);
    if (j.registration) {
      const workflowCertType = j.workflow?.certificationType;
      const selectedCertType =
        workflowCertType === "self" || workflowCertType === "digital"
          ? workflowCertType
          : registration.cert_type === "self" || registration.cert_type === "digital"
            ? registration.cert_type
            : "";
      const serverRegistrationWithCert =
        !j.registration.cert_type && selectedCertType
          ? { ...j.registration, cert_type: selectedCertType }
          : j.registration;
      if (JSON.stringify(serverRegistrationWithCert) !== JSON.stringify(registration)) {
        setRegistration(serverRegistrationWithCert);
      }
    }
    const nextPaid = Boolean(j.paid);
    if (nextPaid !== paid) setPaid(nextPaid);
    if (
      j.visionChecks &&
      j.visionChecks.idPassed !== visionChecks.idPassed
    ) {
      setVisionChecks(j.visionChecks);
    }
    if (j.workflow) {
      setWorkflow(j.workflow);
      setCompliance(j.workflow.compliance ?? null);
      setTrustReport(j.workflow.trustReport ?? null);
      setQuestionnaireAnswers((prev) => ({ ...prev, ...(j.workflow?.questionnaireAnswers ?? {}) }));
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
    if (!sessionId) return;
    const payload = JSON.stringify({ registration, paid });
    if (
      lastAutosavedSessionIdRef.current === sessionId &&
      lastAutosavedPayloadRef.current === payload
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveRegistration(registration, paid).then(() => {
        lastAutosavedSessionIdRef.current = sessionId;
        lastAutosavedPayloadRef.current = payload;
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [sessionId, registration, paid, saveRegistration]);

  const setCertificationType = useCallback(
    async (certificationType: CertificationType) => {
      setRegistration((prev) => ({ ...prev, cert_type: certificationType }));
      if (!sessionId) {
        setAssistant("Session is still initializing. Please retry in a moment.");
        return;
      }

      const optimisticTrustLevel =
        certificationType === "digital"
          ? "digitally_certified"
          : certificationType === "self"
            ? "self_certified"
            : "self_declared";
      const optimisticStage =
        certificationType === "digital"
          ? "digital_verification"
          : certificationType === "self"
            ? "self_certification"
            : "intake";
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          certificationType,
          trustLevel: optimisticTrustLevel,
          certificationStage: optimisticStage,
        };
      });
      setAssistant(
        certificationType === "digital"
          ? "Digital certification path selected."
          : certificationType === "self"
            ? "Self-certification path selected."
            : "Switched to self-declared path.",
      );
      setBadge(
        certificationType === "digital"
          ? "PATH · Level 3 Digital"
          : certificationType === "self"
            ? "PATH · Level 2 Self-Certified"
            : "PATH · Level 1 Self-Declared",
      );

      try {
        const r = await fetch("/api/workflow/transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            action: "select_certification_type",
            certificationType,
          }),
        });
        const parsed = await parseJsonSafe<{ workflow?: WorkflowState }>(r);
        if (parsed.ok && parsed.data?.workflow) {
          setWorkflow(parsed.data.workflow);
          return;
        }
        setAssistant(parsed.errorMessage ?? "Could not update certification path.");
      } catch {
        setAssistant("Could not reach workflow service. Please retry.");
      }
    },
    [sessionId],
  );

  const saveQuestionnaire = useCallback(async () => {
    if (!sessionId) return;
    const r = await fetch("/api/workflow/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        action: "update_questionnaire",
        questionnaireAnswers,
      }),
    });
    const parsed = await parseJsonSafe<{ workflow?: WorkflowState }>(r);
    if (parsed.ok && parsed.data?.workflow) {
      setWorkflow(parsed.data.workflow);
      setAssistant("Questionnaire saved.");
    }
  }, [sessionId, questionnaireAnswers]);

  const runCompliance = useCallback(async () => {
    if (!sessionId) return;
    const r = await fetch("/api/compliance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const parsed = await parseJsonSafe<{ compliance?: ComplianceResult; workflow?: WorkflowState }>(r);
    if (parsed.ok && parsed.data) {
      if (parsed.data.compliance) setCompliance(parsed.data.compliance);
      if (parsed.data.workflow) setWorkflow(parsed.data.workflow);
      setAssistant("Compliance checks completed.");
    }
  }, [sessionId]);

  const createTrustReport = useCallback(async () => {
    if (!sessionId) return;
    const r = await fetch("/api/trust-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const parsed = await parseJsonSafe<{
      trustReport?: TrustReport;
      workflow?: WorkflowState;
    }>(r);
    if (parsed.ok && parsed.data) {
      if (parsed.data.trustReport) setTrustReport(parsed.data.trustReport);
      if (parsed.data.workflow) setWorkflow(parsed.data.workflow);
      setAssistant("WeConnect Trust Report generated.");
    }
  }, [sessionId]);

  const runBuyerSearch = useCallback(async () => {
    setBuyerLoading(true);
    try {
      const qs = new URLSearchParams();
      if (buyerQuery.trim()) qs.set("query", buyerQuery.trim());
      const r = await fetch(`/api/buyer/search?${qs.toString()}`);
      const parsed = await parseJsonSafe<{
        results?: BuyerFlowRow[];
        recommendations?: BuyerFlowRow[];
      }>(r);
      if (!parsed.ok || !parsed.data) {
        setAssistant(parsed.errorMessage ?? "Buyer search failed.");
        return;
      }
      const results = parsed.data.results ?? [];
      setBuyerRows(results);
      setBuyerRecommendations(parsed.data.recommendations ?? []);
      if (results.length) {
        setBuyerSelectedId((prev) => prev ?? results[0].supplier.id);
      }
    } finally {
      setBuyerLoading(false);
    }
  }, [buyerQuery]);

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
      setOwnership(null);
      setOwnershipBreakdown(null);
      setAssistant(j.message ?? "No match.");
      speak(j.message ?? "No match in the demo registry.");
      return;
    }
    setMatch(j.match);
    const preservedCertType =
      registration.cert_type === "self" || registration.cert_type === "digital"
        ? registration.cert_type
        : workflow?.certificationType === "self" || workflow?.certificationType === "digital"
          ? workflow.certificationType
          : "";
    setRegistration({
      ...(j.prefill ?? emptyRegistrationDraft()),
      cert_type: preservedCertType,
    });
    setFieldConfidence(j.fieldConfidence ?? {});
    setFieldSource(j.fieldSource ?? {});
    setFieldEvidence(j.evidence ?? {});
    setDiscoverCandidates(j.candidates ?? []);
    setSelectedCandidateIndex(candidateIndex);
    setNeedsCandidateConfirmation(Boolean(j.source === "web" && j.lowConfidence && !confirmedSelection));
    setCountryRequiresConfirmation(Boolean(j.countryRequiresConfirmation));
    setCountryConfirmed(!Boolean(j.countryRequiresConfirmation));
    setOwnership(j.ownership ?? null);
    setOwnershipBreakdown(j.ownershipBreakdown ?? null);
    setOwnershipEvidenceConfidence(
      Number(j.ownershipEvidenceConfidence ?? j.ownershipConfidence ?? j.ownership?.confidence ?? 0),
    );
    setClassificationSummary(j.classificationSummary);
    setPaid(false);
    const missingFromPrefill = (j.missingRequired ?? [])
      .filter((f) => f !== "paid")
      .slice(0, 4)
      .map(humanizeMissingField);
    const missingLine = missingFromPrefill.length
      ? ` I couldn't fetch ${missingFromPrefill.join(", ")} from web sources, so please add it manually.`
      : "";
    setAssistant(
      j.source === "web"
        ? `We’ve pre-filled your business details. Please confirm. I found ${
            j.match.companyName
          } from live web search and prepared the draft.${missingLine}`
        : `We’ve pre-filled your business details. Please confirm. I found ${j.match.companyName} in ${j.match.jurisdiction}.`,
    );
    if (j.source === "web") {
      const fallbackNote = j.fallbackReason ? ` (${j.fallbackReason})` : "";
      setBadge(`DISCOVERY SOURCE · AWS Bedrock Claude${fallbackNote}`);
      if (j.lowConfidence) {
        setAssistant(
          `I found multiple possible matches for ${j.match.companyName}. Please choose the best candidate before continuing.`,
        );
        setBadge("DISCOVERY REVIEW · candidate confirmation required");
      }
    }
    if (j.source === "web" && j.lowConfidence && !confirmedSelection) {
      const speechMissingLine = missingFromPrefill.length
        ? ` I couldn't fetch ${missingFromPrefill.join(", ")} from SERP and web data. Please fill those manually after confirming the company.`
        : "";
      speak(`I found multiple matches for ${j.match.companyName}. Please confirm the best candidate.${speechMissingLine}`);
    } else {
      const speechMissingLine = missingFromPrefill.length
        ? ` I couldn't fetch ${missingFromPrefill.join(", ")} from SERP and web data. Please fill those manually.`
        : "";
      speak(`We have pre-filled your business details. Please confirm and continue.${speechMissingLine}`);
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
    if (activeCertType === "none") {
      const message = "Please choose certification path first (Step 2).";
      setAssistant(message);
      speak(message);
      return;
    }
    if (isSelfPath) {
      setStage("doc_upload");
      const message =
        "Self-Certified path selected. Please upload your business registration documents to continue.";
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
  const verifyDocuments = async (files: File[]) => {
    if (!sessionId || !files.length) return;
    setIsVerifyingDocs(true);
    try {
      const documents = await Promise.all(
        files.map(async (f) => {
          return new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
             const reader = new FileReader();
             reader.onload = (event) => {
               const dataUrl = event.target?.result as string;
               const base64 = dataUrl.split(",")[1];
               resolve({ base64, mimeType: f.type });
             };
             reader.onerror = reject;
             reader.readAsDataURL(f);
          });
        })
      );

      const res = await fetchWithRetry("/api/document-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, documents }),
      });

      const { ok, data } = await parseJsonSafe<{ result: { verified: boolean; confidence: number; report: string } }>(res);
      if (ok && data?.result) {
        if (data.result.verified) {
          if (isSelfPath) {
            await runCompliance();
            await createTrustReport();
            const message =
              "Self-certification document upload complete. Compliance and trust report are ready. You can issue the certificate.";
            setAssistant(message);
            speak(message);
          } else {
            void callAgent(`I have uploaded the relevant documents. Report: ${data.result.report}`);
          }
        } else {
          if (isSelfPath) {
            const message =
              "Documents uploaded with minor issues. You can continue self-certification and review report flags.";
            setAssistant(message);
            speak(message);
          } else {
            void callAgent(`I uploaded documents but they could not be fully verified contextually. Please instruct me how to proceed. Report: ${data.result.report}`);
          }
        }
      } else {
         alert("Failed to verify documents dynamically.");
      }
    } catch (err) {
      console.warn("Document submission error:", err);
      alert("Verification network error.");
    } finally {
      setIsVerifyingDocs(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const next = [...selectedDocuments];
    const seen = new Set(next.map((f) => `${f.name}:${f.size}:${f.lastModified}:${f.type}`));
    for (const file of files) {
      const sig = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      if (seen.has(sig)) continue;
      if (next.length >= 3) {
        alert("Maximum 3 documents allowed.");
        break;
      }
      seen.add(sig);
      next.push(file);
    }
    if (!next.length) return;
    setSelectedDocuments(next);
    await verifyDocuments(next);
  };

  const verifyUrl =
    typeof window !== "undefined" && cert
      ? `${window.location.origin}/verify/${cert.id}`
      : "";
  const activeCertType: CertificationType =
    workflow?.certificationType && workflow.certificationType !== "none"
      ? workflow.certificationType
      : ((registration.cert_type as CertificationType | undefined) ?? "none");
  const isDigitalPath = activeCertType === "digital";
  const isSelfPath = activeCertType === "self";
  const registrationCheck = validateRegistration(registration, isDigitalPath ? paid : true);
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
    ...(isDigitalPath && !visionChecks.idPassed ? ["vision_id"] : []),
  ];
  const countryConfirmationBlockers =
    countryRequiresConfirmation && !countryConfirmed ? ["country_confirmation"] : [];
  const mergedBlockers = Array.from(
    new Set([...readinessBlockers, ...countryConfirmationBlockers, ...anchorBlockers]),
  );
  const readinessForIssue = mergedBlockers.length === 0;
  const mockCardValid =
    cardNumber.replace(/\s+/g, "").length >= 12 && cardExpiry.trim().length >= 4 && cardCvv.length >= 3;
  const flowSteps = isSelfPath
    ? (["Intake", "Path", "Confirm", "Upload", "Compliance", "Trust Report", "Certificate"] as const)
    : (["Intake", "Path", "Confirm", "Voice", "Upload", "Vision", "Payment", "Certificate"] as const);
  const currentFlowStep = (() => {
    if (cert || stage === "complete") return flowSteps.length - 1;
    if (stage === "anchoring") return flowSteps.length - 1;
    if (!match) return 0;
    if (activeCertType === "none") return 1;
    if (
      needsCandidateConfirmation ||
      !registration.country.trim() ||
      (countryRequiresConfirmation && !countryConfirmed) ||
      stage === "discovered"
    ) {
      return 2;
    }
    if (isSelfPath) {
      if (stage === "doc_upload" && !compliance) return 3;
      if (compliance && !trustReport) return 4;
      if (trustReport && !cert) return 5;
      return 3;
    }
    if (stage === "voice_confirm") return 3;
    if (stage === "doc_upload") return 4;
    if (stage === "vision_id") return 5;
    if (stage === "voice_attestation" || (isDigitalPath && !paid)) return 6;
    return 3;
  })();
  const paymentUnlocked =
    isSelfPath ||
    stage === "voice_attestation" ||
    stage === "anchoring" ||
    stage === "complete" ||
    Boolean(cert);
  const nextAction = (() => {
    if (!sessionId) {
      return {
        title: "Preparing your session…",
        detail: "Please wait a moment.",
      };
    }
    if (!match) {
      return {
        title: "Step 1: Proactive intake.",
        detail: "Enter business name or URL and click Discover.",
      };
    }
    if (activeCertType === "none") {
      return {
        title: "Step 2: Choose certification path.",
        detail: "Select Self-Certified or Digital Certification.",
      };
    }
    if (needsCandidateConfirmation) {
      return {
        title: "Step 3: Confirm the right company candidate.",
        detail: "Pick the best match under Top web candidates and click Use selected candidate.",
      };
    }
    if (!registration.country.trim()) {
      return {
        title: "Step 3: Enter country.",
        detail: "Type country and confirm it before starting verification.",
      };
    }
    if (countryRequiresConfirmation && !countryConfirmed) {
      return {
        title: "Step 3: Confirm country.",
        detail: "Click Confirm country to continue.",
      };
    }
    if (isSelfPath && (stage === "discovered" || stage === "voice_confirm")) {
      return {
        title: "Step 4: Upload Document.",
        detail: "Self path skips voice/vision. Upload your business registration document.",
      };
    }
    if (stage === "discovered" || stage === "voice_confirm") {
      return {
        title: "Step 4: Start voice verification.",
        detail: "Click Start 60-second verification, then say yes.",
      };
    }
    if (stage === "doc_upload") {
      return {
        title: "Step 5: Upload Document.",
        detail: "Select your business registration document and upload it.",
      };
    }
    if (stage === "vision_id") {
      return {
        title: "Step 6: Complete ID video.",
        detail: scanning
          ? "Analyzing your clip… please wait."
          : "Open camera and record a 2-second clip. Keep face and ID steady.",
      };
    }
    if (stage === "voice_attestation") {
      return {
        title: "Step 7: Explain your role.",
        detail: "Use Speak or Type box and describe your daily operational role.",
      };
    }
    if (isDigitalPath && !paid) {
      return {
        title: "Step 8: Complete payment gate.",
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
      title: isSelfPath ? "Step 7: Issue certificate." : "Step 8: Issue certificate.",
      detail: "Click Issue certificate to anchor and finish.",
    };
  })();
  const buyerSelected = buyerRows.find((row) => row.supplier.id === buyerSelectedId) ?? null;
  const buyerStepStates = [
    buyerQuery.trim().length > 0,
    buyerRows.length > 0,
    buyerRows.some((row) => row.match.matchScore >= 0),
    buyerRecommendations.length > 0,
    Boolean(buyerSelected),
    Boolean(buyerSelected && cert),
  ];
  const buyerCurrentStep = (() => {
    const firstPending = buyerStepStates.findIndex((done) => !done);
    return firstPending === -1 ? buyerStepStates.length - 1 : firstPending;
  })();
  const buyerSteps = [
    "Search Query",
    "Ranked Results",
    "Match Score",
    "Top 3 Recos",
    "Supplier Profile",
    "Verify Certificate",
  ] as const;

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

        <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-zinc-900 to-zinc-950 p-4">
          <p className="text-sm font-semibold text-zinc-100">Certification Journey</p>
          <p className="mt-1 text-xs text-zinc-400">
            Build trust from self-declared profile to digitally certified supplier.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200/90">
              Demo mode: not legal identity verification
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200/90">
              Multi-language ready: English, Hindi, Spanish
            </span>
          </div>
        </section>
        {quotaFallbackNotice && (
          <p className="rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 text-xs text-violet-200/95">
            {fallbackReasonCopy(quotaFallbackReason, quotaFallbackSubtype)} Continuing in{" "}
            <strong className="font-medium">demo mode</strong>.{" "}
            {fallbackReasonGuidance(quotaFallbackReason, quotaFallbackSubtype)}
          </p>
        )}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Step 1: Proactive intake</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enter a business name or URL. Try <strong className="text-zinc-200">Global Tech Solutions</strong>, Nile Logistics, or Red Sand Trading.
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
        </section>
        <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold text-cyan-100">Step 2: Choose certification path</p>
          <p className="mt-1 text-xs text-cyan-200/80">
            Current:{" "}
            {activeCertType === "digital"
              ? "Digital Certification (Level 3)"
              : activeCertType === "self"
                ? "Self-Certified (Level 2)"
                : "Not selected"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void setCertificationType("self");
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isSelfPath
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-zinc-700 bg-black/30 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              Self-Certified
            </button>
            <button
              type="button"
              onClick={() => {
                void setCertificationType("digital");
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isDigitalPath
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                  : "border-zinc-700 bg-black/30 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              Digital Certification
            </button>
          </div>
        </section>
        <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold text-cyan-100">Guided Flow</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setJourneyMode("supplier")}
              className={`rounded-md border px-3 py-1 text-xs ${
                journeyMode === "supplier"
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-black/20 text-zinc-400"
              }`}
            >
              Supplier Journey
            </button>
            <button
              type="button"
              onClick={() => setJourneyMode("buyer")}
              className={`rounded-md border px-3 py-1 text-xs ${
                journeyMode === "buyer"
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-black/20 text-zinc-400"
              }`}
            >
              Buyer Journey
            </button>
          </div>
          {journeyMode === "supplier" ? (
            <>
              <p className="mt-3 text-sm text-cyan-50">{nextAction.title}</p>
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
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-cyan-100">Buyer Flow</p>
              <p className="mt-1 text-xs text-cyan-200/80">
                Search to ranked results to match score to recommendations to supplier profile to verify certificate
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {buyerSteps.map((step, index) => (
                  <span
                    key={step}
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      index < buyerCurrentStep
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                        : index === buyerCurrentStep
                          ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                          : "border-white/10 bg-black/20 text-zinc-400"
                    }`}
                  >
                    {index + 1}. {step}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                  value={buyerQuery}
                  onChange={(e) => setBuyerQuery(e.target.value)}
                  placeholder="e.g. Women-owned textile suppliers in India"
                />
                <button
                  type="button"
                  onClick={() => void runBuyerSearch()}
                  className="rounded-lg border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/10"
                >
                  {buyerLoading ? "Searching..." : "Run buyer search"}
                </button>
              </div>

              {!!buyerRows.length && (
                <div className="mt-3 space-y-2 text-xs">
                  <p className="text-zinc-400">Ranked results (certification-priority aware)</p>
                  {buyerRows.slice(0, 3).map((row) => (
                    <button
                      key={row.supplier.id}
                      type="button"
                      onClick={() => setBuyerSelectedId(row.supplier.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        buyerSelectedId === row.supplier.id
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                          : "border-white/10 bg-black/20 text-zinc-300"
                      }`}
                    >
                      {row.supplier.business_name} · Match {row.match.matchScore}% · {row.supplier.cert_type}
                    </button>
                  ))}
                </div>
              )}

              {!!buyerRecommendations.length && (
                <div className="mt-3 text-xs text-zinc-300">
                  <p className="text-zinc-400">Top 3 recommendations:</p>
                  <p className="mt-1">
                    {buyerRecommendations
                      .slice(0, 3)
                      .map((row) => row.supplier.business_name)
                      .join(", ")}
                  </p>
                </div>
              )}

              {buyerSelected && (
                <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
                  <p className="font-medium text-zinc-100">{buyerSelected.supplier.business_name}</p>
                  <p>
                    Trust {buyerSelected.profile.trustScore} · Risk {buyerSelected.profile.riskLevel} · Last verified{" "}
                    {buyerSelected.profile.lastVerified || "N/A"}
                  </p>
                  <p className="mt-1 text-zinc-400">Match rationale: {buyerSelected.match.rankReason}</p>
                  {cert ? (
                    <a
                      href={`/verify/${cert.id}`}
                      className="mt-2 inline-block text-cyan-300 hover:underline"
                    >
                      Verify certificate for current supplier session
                    </a>
                  ) : (
                    <p className="mt-2 text-zinc-500">Issue a certificate to complete verify step.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Certification workspace</h2>
              <p className="mt-1 text-xs text-zinc-400">
                {workflow
                  ? `${trustLevelLabel(workflow.trustLevel)} · Stage: ${workflow.certificationStage}`
                  : "Level 1: Self-Declared · Stage: intake"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="rounded-md border border-white/15 bg-black/20 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {showAdvanced ? "Hide Advanced Controls" : "Show Advanced Controls"}
            </button>
          </div>
          {isSelfPath && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold">Upgrade option</p>
              <p className="mt-1">Upgrade to Digital Certification for higher visibility.</p>
              <button
                type="button"
                onClick={() => {
                  setRegistration((prev) => ({ ...prev, cert_type: "digital" }));
                  void setCertificationType("digital");
                }}
                className="mt-2 rounded border border-cyan-500/50 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
              >
                Upgrade to Digital Certification
              </button>
            </div>
          )}

          {!showAdvanced ? (
            <p className="mt-3 text-xs text-zinc-500">
              Advanced questionnaire, compliance checks, and trust report generation are available in this workspace.
            </p>
          ) : null}

          {showAdvanced && (
            <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-300">
              Ownership control
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={questionnaireAnswers.ownership_control ?? ""}
                onChange={(e) =>
                  setQuestionnaireAnswers((prev) => ({ ...prev, ownership_control: e.target.value }))
                }
                placeholder="Who controls ownership decisions?"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Operational involvement
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={questionnaireAnswers.operational_involvement ?? ""}
                onChange={(e) =>
                  setQuestionnaireAnswers((prev) => ({
                    ...prev,
                    operational_involvement: e.target.value,
                  }))
                }
                placeholder="Describe day-to-day involvement"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Years in business
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={questionnaireAnswers.years_in_business ?? ""}
                onChange={(e) =>
                  setQuestionnaireAnswers((prev) => ({ ...prev, years_in_business: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-zinc-300">
              Clients worked with
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={questionnaireAnswers.clients_worked_with ?? ""}
                onChange={(e) =>
                  setQuestionnaireAnswers((prev) => ({ ...prev, clients_worked_with: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-zinc-300 sm:col-span-2">
              Product scale
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={questionnaireAnswers.product_scale ?? ""}
                onChange={(e) =>
                  setQuestionnaireAnswers((prev) => ({ ...prev, product_scale: e.target.value }))
                }
                placeholder="Current delivery scale/capacity"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveQuestionnaire()}
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Save questionnaire
            </button>
            <button
              type="button"
              onClick={() => void runCompliance()}
              className="rounded border border-emerald-500/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
            >
              Run compliance check
            </button>
            <button
              type="button"
              onClick={() => void createTrustReport()}
              className="rounded border border-cyan-500/50 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
            >
              Generate WeConnect Trust Report
            </button>
          </div>

          {compliance && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
              <p>Sanctions Check: {compliance.sanctionsCheck === "clear" ? "✅ clear" : compliance.sanctionsCheck}</p>
              <p>
                Entity Verification:{" "}
                {compliance.entityVerification === "verified" ? "✅ verified" : compliance.entityVerification}
              </p>
              <p>
                Risk Score: {compliance.riskScore}/100 ({compliance.riskLevel})
              </p>
            </div>
          )}

          {trustReport && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold">WeConnect Trust Report</p>
              <p>Trust Score: {trustReport.trustScore}/100</p>
              <p>Risk Level: {trustReport.riskLevel}</p>
              <p>Ownership Verified: {trustReport.ownershipVerified ? "✅" : "⚠"}</p>
              <p>Identity Match: {trustReport.identityMatch}</p>
              <p>Document Consistency: {trustReport.documentConsistency}</p>
            </div>
          )}

          {workflow?.governance && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
              <p>Roles: {workflow.governance.roles.join(", ")}</p>
              <p>
                Lifecycle: {workflow.governance.validTill ? `Valid till ${new Date(workflow.governance.validTill).toLocaleDateString()}` : "Validity pending"} ·{" "}
                {workflow.governance.continuouslyMonitored ? "Continuously monitored" : "Monitoring paused"}
              </p>
              {workflow.governance.notifications.slice(0, 3).map((n, idx) => (
                <p key={`${n}-${idx}`}>- {n}</p>
              ))}
            </div>
          )}
          {workflow?.governance?.auditTrail?.length ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
              <p className="font-semibold text-zinc-100">Audit trail timeline</p>
              <p className="mt-1 text-zinc-500">Verification steps completed:</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
                {workflow.governance.auditTrail
                  .slice()
                  .reverse()
                  .map((entry, idx) => (
                    <p key={`${entry}-${idx}`} className="rounded border border-white/5 bg-white/[0.02] px-2 py-1">
                      {entry}
                    </p>
                  ))}
              </div>
            </div>
          ) : null}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Intake details and prefill review</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Proactive intake is at the top (Step 1). Use this section to review and refine discovered data.
          </p>
          <p className="mt-1 text-xs text-cyan-200/90">“We’ve pre-filled your business details. Please confirm.”</p>
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
              <p className="mt-1 text-zinc-300">
                Ownership source:{" "}
                <span className="text-cyan-300">{ownership?.sourceType ?? "web_inferred"}</span> · Confidence:{" "}
                <span className="text-cyan-200">{ownershipEvidenceConfidence}%</span>
                {ownership?.value !== undefined ? (
                  <>
                    {" "}
                    · Reported stake: <span className="text-cyan-200">{ownership.value}%</span>
                  </>
                ) : null}
              </p>
              {ownershipBreakdown?.ownership_total_promoter_pct !== undefined ||
              ownershipBreakdown?.ownership_total_public_pct !== undefined ? (
                <p className="mt-1 text-zinc-300">
                  Promoter/Public:{" "}
                  <span className="text-cyan-200">
                    {ownershipBreakdown.ownership_total_promoter_pct ?? "NA"}% /{" "}
                    {ownershipBreakdown.ownership_total_public_pct ?? "NA"}%
                  </span>
                  {ownershipBreakdown.exchange && ownershipBreakdown.symbol ? (
                    <> · {ownershipBreakdown.exchange}:{ownershipBreakdown.symbol}</>
                  ) : null}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void startVerification()}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {isSelfPath ? "Continue Self-Certification" : "Start 60-second verification"}
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
                <label className="text-xs text-zinc-300">
                  Company type
                  <input
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    value={registration.company_type}
                    onChange={(e) =>
                      setRegistration((prev) => ({ ...prev, company_type: e.target.value }))
                    }
                    placeholder="e.g. Private Limited, LLP, Partnership Firm"
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
                {fieldEvidence.company_type ? <p>Company type evidence: {fieldEvidence.company_type}</p> : null}

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

          {stage === "doc_upload" && (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-cyan-500/30 p-6">
              <p className="text-sm font-medium text-cyan-200">Upload Business Registration Document</p>
              <p className="mt-1 text-xs text-zinc-400">Please provide up to 3 files (PDF/Word) for automated extraction.</p>
              {!!selectedDocuments.length && (
                <div className="mt-3 w-full max-w-xl rounded-md border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
                  <p className="font-medium text-zinc-100">Selected files ({selectedDocuments.length}/3)</p>
                  <ul className="mt-1 space-y-1">
                    {selectedDocuments.map((file) => (
                      <li key={`${file.name}-${file.size}-${file.lastModified}`} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setSelectedDocuments([])}
                    className="mt-2 rounded border border-white/15 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
                    disabled={isVerifyingDocs}
                  >
                    Clear selected files
                  </button>
                </div>
              )}
              {isVerifyingDocs ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-cyan-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  Verifying documents with AI...
                </div>
              ) : (
                <label className="mt-4 cursor-pointer rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500">
                  <span>Add Files (Max 3)</span>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileUpload}
                  />
                </label>
              )}
            </div>
          )}

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
            Payment semantics (mocked): $100 hold → capture on approval → refund on rejection.
          </p>
          <p className="mt-1 text-xs text-cyan-200">
            Current payment state: {workflow?.payment.state ?? "not_started"}
          </p>
          {isSelfPath && (
            <p className="mt-2 text-xs text-emerald-300">
              Self-certification path selected: payment hold is skipped for this path.
            </p>
          )}
          {!paymentUnlocked && (
            <p className="mt-2 text-xs text-amber-300">
              Payment unlocks after voice + vision steps are completed.
            </p>
          )}
          {!isSelfPath && (
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
          )}
          {!isSelfPath && (
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={paid}
              disabled={!paymentUnlocked || !mockCardValid}
              onChange={(e) => {
                const nextPaid = e.target.checked;
                setPaid(nextPaid);
                void saveRegistration(registration, nextPaid);
                if (sessionId) {
                  void fetch("/api/workflow/transition", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sessionId,
                      action: "payment_transition",
                      paymentState: nextPaid ? "hold_placed" : "not_started",
                    }),
                  }).then(() => void refreshSession(sessionId));
                }
              }}
            />
            Mark payment as verified (demo)
          </label>
          )}
          {!isSelfPath && !mockCardValid && (
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
