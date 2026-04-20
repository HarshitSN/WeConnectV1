import type {
  CertificationStage,
  CertificationType,
  ComplianceResult,
  PaymentState,
  QuestionnaireAnswers,
  TrustLevel,
  TrustReport,
  VerificationStatus,
} from "@/lib/domains/contracts";

export type GovernanceState = {
  roles: Array<"supplier" | "buyer" | "admin">;
  notifications: string[];
  auditTrail: string[];
  validTill?: string;
  continuouslyMonitored: boolean;
};

export type DomainState = {
  trustLevel: TrustLevel;
  certificationType: CertificationType;
  certificationStage: CertificationStage;
  verificationStatus: VerificationStatus;
  payment: {
    state: PaymentState;
    amountUsd: number;
    holdAt?: string;
    captureAt?: string;
    refundAt?: string;
  };
  questionnaireAnswers: QuestionnaireAnswers;
  compliance?: ComplianceResult;
  trustReport?: TrustReport;
  aiAssessmentSummary?: {
    status: "partial" | "ready";
    score: number;
    updatedAt: string;
  };
  governance: GovernanceState;
};

const globalDomainStore = global as typeof global & {
  domainState?: Map<string, DomainState>;
};

const domainState = globalDomainStore.domainState || new Map<string, DomainState>();
if (!globalDomainStore.domainState) globalDomainStore.domainState = domainState;

function createDefaultDomainState(): DomainState {
  return {
    trustLevel: "self_declared",
    certificationType: "none",
    certificationStage: "intake",
    verificationStatus: "pending",
    payment: {
      state: "not_started",
      amountUsd: 100,
    },
    questionnaireAnswers: {},
    governance: {
      roles: ["supplier", "buyer", "admin"],
      notifications: [],
      auditTrail: ["Session started"],
      continuouslyMonitored: true,
    },
  };
}

export function getDomainState(sessionId: string): DomainState {
  const current = domainState.get(sessionId);
  if (current) return current;
  const created = createDefaultDomainState();
  domainState.set(sessionId, created);
  return created;
}

export function patchDomainState(sessionId: string, patch: Partial<DomainState>): DomainState {
  const current = getDomainState(sessionId);
  const next: DomainState = {
    ...current,
    ...patch,
    payment: {
      ...current.payment,
      ...(patch.payment ?? {}),
    },
    questionnaireAnswers: {
      ...current.questionnaireAnswers,
      ...(patch.questionnaireAnswers ?? {}),
    },
    governance: {
      ...current.governance,
      ...(patch.governance ?? {}),
      notifications: patch.governance?.notifications ?? current.governance.notifications,
      auditTrail: patch.governance?.auditTrail ?? current.governance.auditTrail,
    },
  };
  domainState.set(sessionId, next);
  return next;
}

export function pushGovernanceNotification(sessionId: string, message: string): DomainState {
  const current = getDomainState(sessionId);
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
  return patchDomainState(sessionId, {
    governance: {
      ...current.governance,
      notifications: [stamped, ...current.governance.notifications].slice(0, 20),
      auditTrail: [...current.governance.auditTrail, stamped].slice(-120),
    },
  });
}
