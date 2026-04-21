import { randomBytes } from "crypto";
import type { CertificateRecord, ChatMessage, RegistryCompany, SessionStage } from "./types";
import type { RegistrationDraft } from "./registration";

export type AiAssessmentReport = {
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

export type SessionRecord = {
  id: string;
  stage: SessionStage;
  companyId: string | null;
  companySnapshot?: RegistryCompany;
  terminalLines: string[];
  messages: ChatMessage[];
  certId: string | null;
  lastVision?: {
    task: string;
    result: unknown;
    at: string;
  };
  attestation?: {
    score: number;
    manualReview: boolean;
    rationale?: string;
  };
  registration?: RegistrationDraft;
  paid?: boolean;
  selectedCandidate?: {
    title: string;
    url: string;
    domain?: string;
    score?: number;
  };
  discoveryMeta?: {
    provider?: string;
    fallbackReason?: string;
    lowConfidence?: boolean;
    ownershipSourceType?: "exact_exchange_filing" | "web_inferred" | "registry_prefill";
    ownershipConfidence?: number;
  };
  visionChecks?: {
    idConfidence?: number;
    idPassed?: boolean;
  };
  aiAssessmentReport?: AiAssessmentReport;
  lastAnchorError?: {
    at: string;
    reasonCode: string;
    reasonDetail: string;
    operatorHint?: string;
  };
  geminiFallbacks?: Array<{
    at: string;
    channel: "agent" | "vision" | "attestation";
    reason: string;
    quotaSubtype?: "capacity" | "quota";
    model?: string;
    selectedModel?: string;
    attemptedModels?: string[];
    retryAfterSec?: number;
    quotaMetric?: string;
    quotaId?: string;
  }>;
  geminiGuardrails?: {
    defaultFallbackChainLoggedAt?: string;
  };
  createdAt: number;
  updatedAt: number;
};

const globalStore = global as typeof global & {
  sessions?: Map<string, SessionRecord>;
  certificates?: Map<string, CertificateRecord>;
};

const sessions = globalStore.sessions || new Map<string, SessionRecord>();
const certificates = globalStore.certificates || new Map<string, CertificateRecord>();

if (!globalStore.sessions) globalStore.sessions = sessions;
if (!globalStore.certificates) globalStore.certificates = certificates;

function now() {
  return Date.now();
}

function recomputeAiOverall(report: AiAssessmentReport): AiAssessmentReport {
  const hasDocuments = Boolean(report.documents);
  const hasIdentity = Boolean(report.identity);
  let score = 0;
  if (hasDocuments && hasIdentity) {
    score = Math.round(((report.documents?.confidence ?? 0) + (report.identity?.matchScore ?? 0)) / 2);
  } else if (hasDocuments) {
    score = report.documents?.confidence ?? 0;
  } else if (hasIdentity) {
    score = report.identity?.matchScore ?? 0;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    overall: {
      status: hasDocuments && hasIdentity ? "ready" : "partial",
      score,
    },
  };
}

function ensureAiAssessmentReport(session: SessionRecord): AiAssessmentReport {
  const existing = session.aiAssessmentReport;
  if (existing) return existing;
  const created: AiAssessmentReport = {
    version: "v1-mock",
    generatedAt: new Date().toISOString(),
    mock: true,
    disclaimer: "Mock AI assessment for demo only. This is not legal identity verification.",
    overall: {
      status: "partial",
      score: 0,
    },
  };
  session.aiAssessmentReport = created;
  return created;
}

export function createSession(sessionId?: string): SessionRecord {
  const id = sessionId ?? randomBytes(12).toString("hex");
  const existing = sessions.get(id);
  if (existing) return existing;
  const rec: SessionRecord = {
    id,
    stage: "idle",
    companyId: null,
    terminalLines: [],
    messages: [],
    certId: null,
    createdAt: now(),
    updatedAt: now(),
  };
  sessions.set(id, rec);
  return rec;
}

export function ensureSession(sessionId: string): SessionRecord {
  return getSession(sessionId) ?? createSession(sessionId);
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function touchSession(s: SessionRecord) {
  s.updatedAt = now();
  sessions.set(s.id, s);
}

export function appendTerminal(sessionId: string, line: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const ts = new Date().toISOString().slice(11, 19);
  s.terminalLines.push(`[${ts}] ${line}`);
  if (s.terminalLines.length > 200) s.terminalLines.shift();
  touchSession(s);
}

export function setSessionStage(sessionId: string, stage: SessionStage) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.stage = stage;
  touchSession(s);
}

export function setSessionCompany(
  sessionId: string,
  companyId: string,
  companySnapshot?: RegistryCompany,
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.companyId = companyId;
  if (companySnapshot) s.companySnapshot = companySnapshot;
  touchSession(s);
}

export function pushMessage(sessionId: string, msg: ChatMessage) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.messages.push(msg);
  if (s.messages.length > 80) s.messages.shift();
  touchSession(s);
}

export function setVisionResult(sessionId: string, task: string, result: unknown) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.lastVision = { task, result, at: new Date().toISOString() };
  touchSession(s);
}

export function setAttestation(
  sessionId: string,
  score: number,
  manualReview: boolean,
  rationale?: string,
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.attestation = { score, manualReview, rationale };
  touchSession(s);
}

export function setSessionRegistration(sessionId: string, registration: RegistrationDraft) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.registration = registration;
  touchSession(s);
}

export function getSessionRegistration(sessionId: string): RegistrationDraft | undefined {
  return sessions.get(sessionId)?.registration;
}

export function setSessionPaid(sessionId: string, paid: boolean) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.paid = paid;
  touchSession(s);
}

export function setSessionCandidate(
  sessionId: string,
  candidate: SessionRecord["selectedCandidate"],
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.selectedCandidate = candidate;
  touchSession(s);
}

export function setSessionDiscoveryMeta(
  sessionId: string,
  meta: SessionRecord["discoveryMeta"],
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.discoveryMeta = meta;
  touchSession(s);
}

export function setSessionVisionChecks(
  sessionId: string,
  checks: SessionRecord["visionChecks"],
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.visionChecks = { ...(s.visionChecks ?? {}), ...(checks ?? {}) };
  touchSession(s);
}

export function upsertSessionAiDocumentAssessment(
  sessionId: string,
  documentAssessment: NonNullable<AiAssessmentReport["documents"]>,
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const report = ensureAiAssessmentReport(s);
  s.aiAssessmentReport = recomputeAiOverall({
    ...report,
    documents: documentAssessment,
  });
  touchSession(s);
}

export function upsertSessionAiIdentityAssessment(
  sessionId: string,
  identityAssessment: NonNullable<AiAssessmentReport["identity"]>,
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const report = ensureAiAssessmentReport(s);
  s.aiAssessmentReport = recomputeAiOverall({
    ...report,
    identity: identityAssessment,
  });
  touchSession(s);
}

export function setSessionAnchorError(
  sessionId: string,
  anchorError: SessionRecord["lastAnchorError"] | null,
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (anchorError) {
    s.lastAnchorError = anchorError;
  } else {
    delete s.lastAnchorError;
  }
  touchSession(s);
}

export function appendGeminiFallback(
  sessionId: string,
  entry: NonNullable<SessionRecord["geminiFallbacks"]>[number],
) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.geminiFallbacks = [...(s.geminiFallbacks ?? []), entry].slice(-30);
  touchSession(s);
}

export function markGeminiFallbackChainGuardrail(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  if (!s) return false;
  if (s.geminiGuardrails?.defaultFallbackChainLoggedAt) return false;
  s.geminiGuardrails = {
    ...(s.geminiGuardrails ?? {}),
    defaultFallbackChainLoggedAt: new Date().toISOString(),
  };
  touchSession(s);
  return true;
}

export function issueCertificate(
  sessionId: string,
  data: Omit<CertificateRecord, "id" | "revoked">,
): CertificateRecord {
  const id = randomBytes(10).toString("hex");
  const cert: CertificateRecord = {
    ...data,
    id,
    revoked: false,
  };
  certificates.set(id, cert);
  const s = sessions.get(sessionId);
  if (s) {
    s.certId = id;
    touchSession(s);
  }
  return cert;
}

export function getCertificate(id: string): CertificateRecord | undefined {
  return certificates.get(id);
}

export function revokeCertificate(certId: string, reason: string) {
  const c = certificates.get(certId);
  if (!c) return false;
  c.revoked = true;
  c.revokedReason = reason;
  certificates.set(certId, c);
  return true;
}

export function listCertificates(): CertificateRecord[] {
  return [...certificates.values()];
}

export function listSessions(): SessionRecord[] {
  return [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
