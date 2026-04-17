export type TrustLevel = "self_declared" | "self_certified" | "digitally_certified";
export type CertificationType = "none" | "self" | "digital";
export type CertificationStage =
  | "intake"
  | "self_certification"
  | "digital_verification"
  | "compliance"
  | "questionnaire"
  | "trust_report"
  | "certificate_ready"
  | "completed";
export type RiskLevel = "low" | "medium" | "high";
export type VerificationStatus = "pending" | "running" | "passed" | "manual_review" | "failed";

export type PaymentState = "not_started" | "hold_placed" | "captured" | "refunded";

export type QuestionnaireAnswers = Record<string, string>;

export type VerificationSummary = {
  ownershipVerified: boolean;
  identityMatch: "high" | "medium" | "low";
  documentConsistency: "clean" | "minor_flag" | "major_flag";
  sanctionsCheck: "clear" | "flagged" | "pending";
  entityVerification: "verified" | "pending" | "mismatch";
};

export type ComplianceResult = {
  sanctionsCheck: "clear" | "flagged" | "pending";
  entityVerification: "verified" | "pending" | "mismatch";
  riskScore: number;
  riskLevel: RiskLevel;
  notes: string[];
  checkedAt: string;
};

export type TrustReport = {
  trustScore: number;
  riskLevel: RiskLevel;
  ownershipVerified: boolean;
  identityMatch: "high" | "medium" | "low";
  documentConsistency: "clean" | "minor_flag" | "major_flag";
  generatedAt: string;
};

export type BuyerMatchResult = {
  supplierId: string;
  matchScore: number;
  certificationPriority: number;
  rankReason: string;
};

export type SupplierProfileContract = {
  id: string;
  businessName: string;
  country: string;
  certificationType: CertificationType;
  trustLevel: TrustLevel;
  trustScore: number;
  riskLevel: RiskLevel;
  verificationSummary: VerificationSummary;
  lastVerified: string;
};

export function trustLevelLabel(level: TrustLevel): string {
  switch (level) {
    case "self_declared":
      return "Level 1: Self-Declared";
    case "self_certified":
      return "Level 2: Self-Certified";
    case "digitally_certified":
      return "Level 3: Digitally Certified";
  }
}

export function certificationPriority(type: CertificationType): number {
  if (type === "digital") return 3;
  if (type === "self") return 2;
  return 1;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return "low";
  if (score >= 40) return "medium";
  return "high";
}

export function trustLevelFromCertification(type: CertificationType): TrustLevel {
  if (type === "digital") return "digitally_certified";
  if (type === "self") return "self_certified";
  return "self_declared";
}
