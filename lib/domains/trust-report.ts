import type { SessionRecord } from "@/lib/session-store";
import type { TrustReport, VerificationSummary } from "@/lib/domains/contracts";
import { getDomainState, patchDomainState, pushGovernanceNotification } from "@/lib/store/domain-store";
import { runComplianceCheck } from "@/lib/domains/compliance-risk";

export function buildVerificationSummary(sessionId: string, session: SessionRecord): VerificationSummary {
  const domain = getDomainState(sessionId);
  const compliance = domain.compliance ?? runComplianceCheck(sessionId, session);
  return {
    ownershipVerified: Boolean(session.registration?.owner_details?.length),
    identityMatch: session.visionChecks?.idPassed ? "high" : "medium",
    documentConsistency: session.lastVision ? "minor_flag" : "clean",
    sanctionsCheck: compliance.sanctionsCheck,
    entityVerification: compliance.entityVerification,
  };
}

export function generateTrustReport(sessionId: string, session: SessionRecord): TrustReport {
  const domain = getDomainState(sessionId);
  const compliance = domain.compliance ?? runComplianceCheck(sessionId, session);
  const summary = buildVerificationSummary(sessionId, session);

  let trustScore = compliance.riskScore;
  if (domain.trustLevel === "digitally_certified") trustScore += 8;
  if (domain.trustLevel === "self_certified") trustScore += 3;
  if (summary.identityMatch === "high") trustScore += 5;
  if (summary.documentConsistency === "minor_flag") trustScore -= 2;
  trustScore = Math.max(10, Math.min(99, trustScore));

  const report: TrustReport = {
    trustScore,
    riskLevel: compliance.riskLevel,
    ownershipVerified: summary.ownershipVerified,
    identityMatch: summary.identityMatch,
    documentConsistency: summary.documentConsistency,
    generatedAt: new Date().toISOString(),
  };

  patchDomainState(sessionId, {
    trustReport: report,
    certificationStage: "trust_report",
  });
  pushGovernanceNotification(sessionId, `Trust report generated with score ${report.trustScore}`);

  return report;
}
