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
    founderNames?: string[];
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

type AiAssessmentReport = {
  version: string;
  generatedAt: string;
  mock: boolean;
  disclaimer: string;
  documents?: {
    submittedCount: number;
    verified: boolean;
    confidence: number;
    summary: string;
    checkedAt: string;
  };
  identity?: {
    idFaceMatch: boolean;
    matchScore: number;
    confidence: number;
    livenessHint?: string;
    nameGuess?: string;
    warningCode?: string;
    nameMatchBypassed?: boolean;
    checkedAt: string;
  };
  overall: {
    status: "partial" | "ready";
    score: number;
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
  const [fieldEvidence, setFieldEvidence] = useState<Partial<Record<keyof RegistrationDraft, string>>>(
    {},
  );
  const [classificationSummary, setClassificationSummary] = useState<
    DiscoverJson["classificationSummary"] | undefined
  >(undefined);
  const [founderNames, setFounderNames] = useState<string[]>([]);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [aiAssessmentReport, setAiAssessmentReport] = useState<AiAssessmentReport | null>(null);
  const [downloadingAiReport, setDownloadingAiReport] = useState(false);
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
      aiAssessmentReport?: AiAssessmentReport;
      workflow?: WorkflowState;
    };
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
    if (j.aiAssessmentReport) {
      setAiAssessmentReport(j.aiAssessmentReport);
    } else {
      setAiAssessmentReport(null);
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
    setFounderNames(j.enrichmentSummary?.founderNames ?? []);
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
        ? `We’ve pre-filled your business details. Please confirm. I found ${j.match.companyName
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
      const message = "Please choose certification path first (Step 1).";
      setAssistant(message);
      speak(message);
      return;
    }
    if (isSelfPath) {
      const message =
        "Self-Certified path selected. Please upload your business registration documents to continue.";
      setStage("doc_upload");
      setAssistant(message);
      if (sessionId) {
        await fetch("/api/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, stage: "doc_upload" }),
        });
      }
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

  const downloadAiAssessmentReport = useCallback(async () => {
    if (!sessionId) return;
    setDownloadingAiReport(true);
    try {
      const response = await fetch(`/api/ai-assessment/report?sessionId=${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        const parsed = await parseJsonSafe<{ error?: string }>(response);
        setAssistant(parsed.errorMessage ?? "AI assessment report is not ready yet.");
        return;
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename=\"([^\"]+)\"/i);
      const filename = filenameMatch?.[1] ?? `ai-assessment-${sessionId.slice(0, 8)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setAssistant("AI assessment report downloaded.");
    } catch {
      setAssistant("Could not download AI assessment report. Please retry.");
    } finally {
      setDownloadingAiReport(false);
    }
  }, [sessionId]);

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
    ? (["Path", "Intake", "Confirm", "Upload", "Compliance", "Trust Report", "Certificate"] as const)
    : (["Path", "Intake", "Confirm", "Voice", "Upload", "Vision", "Payment", "Certificate"] as const);
  const currentFlowStep = (() => {
    if (cert || stage === "complete") return flowSteps.length - 1;
    if (stage === "anchoring") return flowSteps.length - 1;
    if (activeCertType === "none") return 0;
    if (!match) return 1;
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
  const showPaymentHint = paymentUnlocked && mockCardValid && !paid;
  const aiAssessmentReady =
    isDigitalPath &&
    aiAssessmentReport?.overall.status === "ready" &&
    Boolean(aiAssessmentReport.documents) &&
    Boolean(aiAssessmentReport.identity);
  const nextAction = (() => {
    if (!sessionId) {
      return {
        title: "Preparing your session…",
        detail: "Please wait a moment.",
      };
    }
    if (activeCertType === "none") {
      return {
        title: "Step 1: Choose certification path.",
        detail: "Select Self-Certified or Digital Certification.",
      };
    }
    if (!match) {
      return {
        title: "Step 2: Proactive intake.",
        detail: "Enter business name or URL and click Discover.",
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
    <div className="relative flex min-h-0 flex-1 flex-col gap-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-200/70 blur-3xl" />
        <div className="absolute right-[-8rem] top-1/3 h-80 w-80 rounded-full bg-sky-200/60 blur-3xl" />
      </div>
      <BlockAnchorAnimation active={anchoring} txHash={pendingTx} />

      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-5">
        {!embed && (
          <header className="rounded-2xl border border-slate-200 bg-white/85 px-4 sm:px-5 py-3 shadow-[0_14px_36px_rgb(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">WEC-Guardian · demonstration only</span>
            <div className="flex gap-3">
              <Link href="/admin" className="font-medium text-cyan-700 transition hover:text-cyan-900">
                Admin
              </Link>
              <Link href="/demo" className="font-medium text-cyan-700 transition hover:text-cyan-900">
                Split demo
              </Link>
            </div>
            </div>
          </header>
        )}

        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/85 p-4 sm:p-6 shadow-[0_16px_40px_rgb(15,23,42,0.12)] backdrop-blur-xl">
          <p className="text-base font-bold text-slate-900">60 second certificate process</p>
          <p className="mt-1 text-xs text-slate-600">
            Build trust from self-declared profile to digitally certified supplier.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-amber-300/70 bg-amber-100 px-2 py-1 text-amber-700">
              Demo mode: not legal identity verification
            </span>
            <span className="rounded-full border border-cyan-300/70 bg-cyan-100 px-2 py-1 text-cyan-700">
              Multi-language ready: English, Hindi, Spanish
            </span>
          </div>
        </section>
        {quotaFallbackNotice && (
          <p className="rounded-lg border border-sky-300/35 bg-sky-400/10 px-3 py-2 text-xs text-sky-100/95">
            {fallbackReasonCopy(quotaFallbackReason, quotaFallbackSubtype)} Continuing in{" "}
            <strong className="font-medium">demo mode</strong>.{" "}
            {fallbackReasonGuidance(quotaFallbackReason, quotaFallbackSubtype)}
          </p>
        )}
        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/85 p-4 sm:p-6 shadow-[0_14px_36px_rgb(15,23,42,0.1)] backdrop-blur-xl">
          <p className="text-base font-bold text-slate-900">Step 1: Choose certification path</p>
          <p className="mt-1 text-xs text-slate-600">
            Current:{" "}
            {activeCertType === "digital"
              ? "Digital Certification"
              : activeCertType === "self"
                ? "Self-Certified"
                : "Not selected"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void setCertificationType("self");
              }}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${isSelfPath
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
            >
              Self-Certified
            </button>
            <button
              type="button"
              onClick={() => {
                void setCertificationType("digital");
              }}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${isDigitalPath
                ? "border-cyan-300 bg-cyan-50 text-cyan-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
            >
              Digital Certification
            </button>
          </div>
        </section>
        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/85 p-4 sm:p-6 shadow-[0_14px_36px_rgb(15,23,42,0.1)] backdrop-blur-xl">
          <h2 className="text-xl font-bold text-slate-900">Step 2: Proactive intake</h2>
          <p className="mt-1 text-sm text-slate-600">
            Enter a business name or URL. Try <strong className="text-slate-900">Global Tech Solutions</strong>, Nile Logistics, or Red Sand Trading.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-300/80 focus:ring-2 focus:ring-cyan-200/40"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name or URL"
            />
            <button
              type="button"
              onClick={() => void runDiscover()}
              disabled={!sessionId}
              className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(8,112,184,0.35)] transition hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40"
            >
              Discover
            </button>
          </div>
        </section>
        <section className="rounded-2xl sm:rounded-[32px] border border-white/40 bg-white/60 p-4 sm:p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl">
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Guided Flow</h2>
          <p className="mt-3 text-sm font-semibold text-cyan-900">{nextAction.title}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">{nextAction.detail}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {flowSteps.map((step, index) => (
              <span
                key={step}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm ${index < currentFlowStep
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                  : index === currentFlowStep
                    ? "border-cyan-300 bg-cyan-500 text-white shadow-cyan-100"
                    : "border-slate-100 bg-white text-slate-400"
                  }`}
              >
                {index + 1}. {step}
              </span>
            ))}
          </div>
          {match && activeCertType !== "none" && (stage === "discovered" || stage === "voice_confirm" || stage === "idle") && (
            <button
              type="button"
              onClick={() => void startVerification()}
              className="mt-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(8,120,90,0.32)] transition hover:from-emerald-500 hover:to-teal-400"
            >
              {isSelfPath ? "Continue Self-Certification" : "Start 60-second verification"}
            </button>
          )}
        </section>

        <section className="rounded-2xl sm:rounded-[32px] border border-white/40 bg-white/80 p-4 sm:p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-800">Advanced Workspace</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {workflow
                  ? `${trustLevelLabel(workflow.trustLevel)} · Stage: ${workflow.certificationStage}`
                  : "Level 1: Self-Declared · Stage: intake"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
            >
              {showAdvanced ? "HIDE CONTROLS" : "SHOW CONTROLS"}
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
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ownership control</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    value={questionnaireAnswers.ownership_control ?? ""}
                    onChange={(e) =>
                      setQuestionnaireAnswers((prev) => ({ ...prev, ownership_control: e.target.value }))
                    }
                    placeholder="Who controls ownership decisions?"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Operational involvement</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
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
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Years in business</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                    value={questionnaireAnswers.years_in_business ?? ""}
                    onChange={(e) =>
                      setQuestionnaireAnswers((prev) => ({ ...prev, years_in_business: e.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Clients worked with</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                    value={questionnaireAnswers.clients_worked_with ?? ""}
                    onChange={(e) =>
                      setQuestionnaireAnswers((prev) => ({ ...prev, clients_worked_with: e.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Product scale</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    value={questionnaireAnswers.product_scale ?? ""}
                    onChange={(e) =>
                      setQuestionnaireAnswers((prev) => ({ ...prev, product_scale: e.target.value }))
                    }
                    placeholder="Current delivery scale/capacity"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveQuestionnaire()}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                >
                  SAVE QUESTIONNAIRE
                </button>
                <button
                  type="button"
                  onClick={() => void runCompliance()}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-600 shadow-sm transition-all hover:bg-emerald-100 active:scale-95"
                >
                  RUN COMPLIANCE CHECK
                </button>
                <button
                  type="button"
                  onClick={() => void createTrustReport()}
                  className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-600 shadow-sm transition-all hover:bg-cyan-100 active:scale-95"
                >
                  GENERATE TRUST REPORT
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

        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/85 p-4 sm:p-6 shadow-[0_14px_36px_rgb(15,23,42,0.1)] backdrop-blur-xl">
          {false && (
            <>
              <h2 className="text-lg font-semibold text-white">Intake details and prefill review</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Proactive intake is at the top (Step 2). Use this section to review and refine discovered data.
              </p>
              <p className="mt-1 text-xs text-cyan-200/90">“We’ve pre-filled your business details. Please confirm.”</p>
            </>
          )}
          {match && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/75 p-4 text-sm">
              <p className="font-semibold text-emerald-800">{match.companyName}</p>
              <p className="text-slate-600">{match.registrySnippet}</p>
              <p className="mt-2 text-slate-700">
                Primary owner: <span className="font-medium text-slate-900">{match.primaryOwner}</span> · Female
                ownership (filed, prefill only):{" "}
                <span className="text-emerald-700">
                  {typeof match.ownershipFemalePct === "number" && ownershipEvidenceConfidence > 0
                    ? `${match.ownershipFemalePct}%`
                    : "Unknown (awaiting evidence)"}
                </span>
              </p>
              <p className="mt-1 text-slate-700">
                Primary owner share (prefill, unverified):{" "}
                <span className="text-amber-700">
                  {typeof match.ownerPrefillPct === "number" ? `${match.ownerPrefillPct}%` : "Unknown"}
                </span>
              </p>
              <p className="mt-1 text-slate-700">
                Ownership source:{" "}
                <span className="text-cyan-700">{ownership?.sourceType ?? "web_inferred"}</span> · Confidence:{" "}
                <span className="text-cyan-700">{ownershipEvidenceConfidence}%</span>
                {ownership?.value !== undefined ? (
                  <>
                    {" "}
                    · Reported stake: <span className="text-cyan-700">{ownership.value}%</span>
                  </>
                ) : null}
              </p>
              {ownershipBreakdown?.ownership_total_promoter_pct !== undefined ||
                ownershipBreakdown?.ownership_total_public_pct !== undefined ? (
                <p className="mt-1 text-slate-700">
                  Promoter/Public:{" "}
                  <span className="text-cyan-700">
                    {ownershipBreakdown.ownership_total_promoter_pct ?? "NA"}% /{" "}
                    {ownershipBreakdown.ownership_total_public_pct ?? "NA"}%
                  </span>
                  {ownershipBreakdown.exchange && ownershipBreakdown.symbol ? (
                    <> · {ownershipBreakdown.exchange}:{ownershipBreakdown.symbol}</>
                  ) : null}
                </p>
              ) : null}
              {needsCandidateConfirmation ? (
                <p className="mt-2 text-xs text-amber-700">
                  Candidate confirmation required before verification can start.
                </p>
              ) : null}
              {countryRequiresConfirmation && !countryConfirmed ? (
                <p className="mt-2 text-xs text-amber-700">
                  Country confirmation required before verification can start.
                </p>
              ) : null}
            </div>
          )}
          {match && (
            <div className="mt-6 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/80 to-white/80 p-5 shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-cyan-100/50 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-cyan-900">Prefill Review</h3>
                  <p className="text-xs text-cyan-700/70">
                    Verify and edit the details fetched from the registry or web.
                  </p>
                </div>
                <div className="rounded-full bg-cyan-100/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                  Editable
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Business name</span>
                  <input
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                    value={registration.business_name}
                    onChange={(e) =>
                      setRegistration((prev) => ({ ...prev, business_name: e.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Country</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                      value={registration.country}
                      onChange={(e) => {
                        const next = e.target.value;
                        setRegistration((prev) => ({ ...prev, country: next }));
                        if (countryRequiresConfirmation) {
                          setCountryConfirmed(false);
                        }
                      }}
                    />
                    {countryRequiresConfirmation && (
                      <button
                        type="button"
                        onClick={() => setCountryConfirmed(Boolean(registration.country.trim()))}
                        className={`absolute right-2 top-1.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                          countryConfirmed 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                            : "bg-cyan-50 text-cyan-600 border border-cyan-100 hover:bg-cyan-100"
                        }`}
                      >
                        {countryConfirmed ? "✓ Confirmed" : "Confirm"}
                      </button>
                    )}
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Primary owner</span>
                  <input
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                    value={registration.owner_details[0]?.fullName || ""}
                    onChange={(e) =>
                      setRegistration((prev) => ({
                        ...prev,
                        owner_details: [
                          {
                            fullName: e.target.value,
                            gender: prev.owner_details[0]?.gender || "Unknown",
                            ownershipPct: prev.owner_details[0]?.ownershipPct ?? 100,
                          },
                        ],
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">NAICS codes</span>
                  <input
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    placeholder="e.g. 541511, 511210"
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

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">UNSPSC codes</span>
                  <input
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    placeholder="e.g. 43232304, 43232107"
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

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Female owned %</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                    value={registration.owner_details[0]?.ownershipPct ?? 0}
                    onChange={(e) =>
                      setRegistration((prev) => ({
                        ...prev,
                        owner_details: [
                          {
                            fullName: prev.owner_details[0]?.fullName || (match?.primaryOwner ?? ""),
                            gender: prev.owner_details[0]?.gender || "Female",
                            ownershipPct: Number(e.target.value || 0),
                          },
                        ],
                      }))
                    }
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Company type</span>
                  <input
                    className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    value={registration.company_type}
                    onChange={(e) =>
                      setRegistration((prev) => ({ ...prev, company_type: e.target.value }))
                    }
                    placeholder="e.g. Private Limited, LLP"
                  />
                </label>

                {founderNames.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Founders</span>
                    <div className="flex flex-wrap gap-2">
                      {founderNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </div>
              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-800/60">Business description (min 30 chars)</span>
                <textarea
                  className="w-full rounded-xl border border-cyan-200/50 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10"
                  rows={3}
                  value={registration.business_description}
                  onChange={(e) =>
                    setRegistration((prev) => ({ ...prev, business_description: e.target.value }))
                  }
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-cyan-100/50 pt-4">
                <div className="flex items-center gap-1.5 rounded-full bg-cyan-50/50 px-3 py-1 text-[10px] font-bold text-cyan-700 shadow-sm border border-cyan-100/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  Name Confidence: {fieldConfidence.business_name ?? 0}%
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-cyan-50/50 px-3 py-1 text-[10px] font-bold text-cyan-700 shadow-sm border border-cyan-100/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  Country Confidence: {fieldConfidence.country ?? 0}%
                </div>
              </div>
              <div className="mt-3 space-y-1.5 px-1">
                {fieldEvidence.business_name ? <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Evidence (Name): <span className="font-medium normal-case italic text-slate-500">{fieldEvidence.business_name}</span></p> : null}
                {fieldEvidence.country ? <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Evidence (Country): <span className="font-medium normal-case italic text-slate-500">{fieldEvidence.country}</span></p> : null}
              </div>
              
              {!!discoverCandidates.length && (
                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Web Search Candidates</p>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                        value={selectedCandidateIndex}
                        onChange={(e) => setSelectedCandidateIndex(Number(e.target.value))}
                      >
                        {discoverCandidates.slice(0, 3).map((c, idx) => (
                          <option key={`${c.url}-${idx}`} value={idx}>
                            Candidate #{idx + 1} ({c.score ?? 0})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void runDiscover(selectedCandidateIndex, true)}
                        className="rounded-lg bg-cyan-600 px-3 py-1 text-[11px] font-bold text-white transition-all hover:bg-cyan-500"
                      >
                        USE THIS
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {discoverCandidates.slice(0, 3).map((c, idx) => (
                      <div 
                        key={`${c.url}-${idx}`} 
                        className={`rounded-xl border p-3 transition-all ${idx === selectedCandidateIndex ? "border-cyan-200 bg-white shadow-sm ring-1 ring-cyan-100" : "border-slate-100 bg-white/50 opacity-60"}`}
                      >
                        <p className="text-xs font-bold text-slate-800">{c.title}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500 line-clamp-2">{c.snippet}</p>
                        {c.domain && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-cyan-600">{c.domain}</p>}
                      </div>
                    ))}
                  </div>
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

        <section className="rounded-2xl sm:rounded-[32px] border border-white/40 bg-white/80 p-4 sm:p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Voice · Vision</h2>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
              Stage: {stage}
            </div>
          </div>
          
          <div className="mt-5 space-y-3">
            <p className="rounded-2xl bg-cyan-50/50 p-4 text-sm leading-relaxed text-slate-700 shadow-inner">
              {assistant || "Awaiting input..."}
            </p>
            
            {badge && (
              <div className="flex items-center gap-2 rounded-xl border border-cyan-100 bg-white/50 px-3 py-2 font-mono text-[11px] text-cyan-700 shadow-sm">
                <span className="font-bold opacity-40">SYSTEM:</span> {badge}
              </div>
            )}
            
            {visionNote && (
              <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                Vision: {visionNote}
              </p>
            )}
            
            {visionWarning && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs font-medium text-amber-700">
                <span className="text-sm">⚠</span> {visionWarning}
              </div>
            )}
            
            {!!visionBlockers.length && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs font-medium text-rose-700">
                <span className="text-sm">✖</span> Blockers: {visionBlockers.join(", ")}
              </div>
            )}
          </div>

          <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row gap-3">
            <VoiceConcierge
              onTranscript={(t) => void onVoice(t)}
              disabled={!sessionId || !match || stage === "complete"}
            />
            <div className="flex-1">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-medium text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-400/5 placeholder:text-slate-400"
                placeholder="Type instead of speaking..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value;
                    if (val.trim()) {
                      void onVoice(val);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
          </div>
          
          {stage === "doc_upload" && (
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-50/30 p-8 text-center transition-colors hover:bg-cyan-50/50">
              <div className="mb-3 rounded-full bg-cyan-100 p-3 text-cyan-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-base font-semibold text-cyan-900">Upload Registration Documents</p>
              <p className="mt-1 text-xs text-slate-500">Supported formats: PDF, DOCX (Max 3 files)</p>
              
              {!!selectedDocuments.length && (
                <div className="mt-6 w-full max-w-md divide-y divide-cyan-100 rounded-xl border border-cyan-100 bg-white p-2 shadow-sm">
                  <div className="flex flex-col gap-2 p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected files ({selectedDocuments.length}/3)</p>
                    <ul className="space-y-1.5">
                      {selectedDocuments.map((file) => (
                        <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 truncate text-[11px] font-medium text-slate-600">
                          <span className="h-1 w-1 rounded-full bg-cyan-400" />
                          {file.name}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setSelectedDocuments([])}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                      disabled={isVerifyingDocs}
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
              
              {isVerifyingDocs ? (
                <div className="mt-5 flex items-center gap-3 rounded-full bg-cyan-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-200">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  AI EXTRACTING...
                </div>
              ) : (
                <label className="mt-6 cursor-pointer rounded-2xl bg-gradient-to-r from-cyan-600 to-sky-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-200 transition-all hover:-translate-y-0.5 hover:shadow-cyan-300 active:translate-y-0 active:scale-95">
                  <span>SELECT FILES</span>
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

        {isDigitalPath && (
          <section className="rounded-2xl sm:rounded-[32px] border border-white/40 bg-white/80 p-4 sm:p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">AI Assessment Report</h2>
            <p className="mt-1 text-sm text-slate-500">
              Official document verification and identity matching metrics.
            </p>
            
            <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50/30 p-4">
              <p className={`text-xs font-bold uppercase tracking-wider ${aiAssessmentReady ? "text-emerald-600" : "text-amber-600"}`}>
                STATUS: {aiAssessmentReady ? "Ready to download" : "Pending verification"}
              </p>
              
              {aiAssessmentReport ? (
                <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overall Score</p>
                    <p className="text-2xl font-black text-slate-900">{aiAssessmentReport.overall.score}%</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Document accuracy</p>
                    <p className="text-2xl font-black text-slate-900">{aiAssessmentReport.documents?.confidence ?? "—"}%</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">ID-Face Match</p>
                    <p className="text-2xl font-black text-slate-900">{aiAssessmentReport.identity?.matchScore ?? "—"}%</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex h-24 items-center justify-center rounded-xl border border-dashed border-cyan-200 text-xs font-medium text-cyan-700/50">
                  Waiting for document & ID upload...
                </div>
              )}
              
              {aiAssessmentReport?.disclaimer && (
                <p className="mt-4 text-[10px] font-bold italic leading-relaxed text-slate-500 uppercase tracking-tight">{aiAssessmentReport.disclaimer}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void downloadAiAssessmentReport()}
              disabled={!aiAssessmentReady || downloadingAiReport}
              className="mt-6 w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-40"
            >
              {downloadingAiReport ? "PREPARING PDF..." : "DOWNLOAD FULL REPORT"}
            </button>
          </section>
        )}

        {cert && (
          <CertificateCard cert={cert} verifyUrl={verifyUrl || `/verify/${cert.id}`} />
        )}

        <section className="rounded-2xl sm:rounded-[32px] border border-white/40 bg-white/80 p-4 sm:p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] backdrop-blur-xl">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Final Gate · Payment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Secure $100 hold captured on approval or fully refunded on rejection.
          </p>
          
          <div className="mt-5 space-y-4">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider ${
              workflow?.payment.state === "hold_placed" ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-cyan-100 bg-cyan-50 text-cyan-600"
            }`}>
              STAKE STATE: {workflow?.payment.state ?? "not_started"}
            </div>

            {isSelfPath && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs font-medium text-emerald-700">
                <span className="font-bold">✓ SELF-CERTIFICATION:</span> Payment hold is waived for this path.
              </div>
            )}

            {!isSelfPath && (
              <div className="space-y-3">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    placeholder="Card number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    disabled={!paymentUnlocked}
                  />
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    placeholder="MM/YY"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    disabled={!paymentUnlocked}
                  />
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition-all focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/10 placeholder:text-slate-400"
                    placeholder="CVV"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    disabled={!paymentUnlocked}
                  />
                </div>
                
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all ${
                  !paymentUnlocked || !mockCardValid ? "border-slate-100 bg-slate-50/50 opacity-50 grayscale" : "border-cyan-100 bg-white shadow-sm hover:border-cyan-200"
                }`}>
                  <div className="relative flex h-5 w-5 items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 bg-white transition-all checked:border-cyan-500 checked:bg-cyan-500 focus:outline-none"
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
                    <svg className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Verify Payment Hold</p>
                    <p className="text-[11px] font-bold text-slate-600">Place $100 hold for verification</p>
                  </div>
                </label>
                
                {showPaymentHint && (
                  <p className="mt-3 text-[10px] font-bold italic text-slate-500 px-1 uppercase tracking-tight">
                    Note: Enter any valid digits for mock card details.
                  </p>
                )}
                
                {!paymentUnlocked && (
                  <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    <span className="text-xs">🔒</span> UNLOCKS AFTER VOICE · VISION STEPS
                  </p>
                )}
                {!mockCardValid && paymentUnlocked && (
                  <p className="text-[10px] font-bold italic text-slate-500 px-1 uppercase tracking-tight">Enter any valid digits for mock card details.</p>
                )}
              </div>
            )}

            {!!anchorBlockers.length && (
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs font-medium text-rose-700">
                <p className="font-bold uppercase tracking-wider mb-1">Issue Blocked:</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(anchorBlockers)).map(b => (
                    <span key={b} className="rounded-md bg-white/50 px-1.5 py-0.5 border border-rose-100">{b}</span>
                  ))}
                </div>
              </div>
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
              className={`mt-4 w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest text-white transition-all shadow-lg ${
                anchoring || Boolean(cert) || !readinessForIssue
                  ? "bg-slate-100 text-slate-300 shadow-none cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-200 hover:-translate-y-0.5 hover:shadow-emerald-300 active:translate-y-0"
              }`}
            >
              {anchoring ? "ISSUING CERTIFICATE..." : cert ? "CERTIFICATE ISSUED" : "ISSUE CERTIFICATE"}
            </button>
          </div>
        </section>
      </main>

    </div>
  );
}
