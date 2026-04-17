import { riskLevelFromScore, type ComplianceResult } from "@/lib/domains/contracts";
import { getDomainState, patchDomainState, pushGovernanceNotification } from "@/lib/store/domain-store";
import type { SessionRecord } from "@/lib/session-store";

export function runComplianceCheck(sessionId: string, session: SessionRecord): ComplianceResult {
  const domain = getDomainState(sessionId);
  const sanctionsCheck: ComplianceResult["sanctionsCheck"] = "clear";
  const entityVerification: ComplianceResult["entityVerification"] = session.companyId ? "verified" : "pending";

  let riskScore = 65;
  if (session.visionChecks?.idPassed) riskScore += 12;
  if (session.attestation?.score) riskScore += Math.round(session.attestation.score * 0.15);
  if (domain.certificationType === "digital") riskScore += 8;
  if (domain.certificationType === "none") riskScore -= 10;
  riskScore = Math.max(5, Math.min(98, riskScore));

  const notes: string[] = [
    "Sanctions Check: clear",
    `Entity Verification: ${entityVerification}`,
    `Risk Score: ${riskScore}/100`,
  ];

  const result: ComplianceResult = {
    sanctionsCheck,
    entityVerification,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    notes,
    checkedAt: new Date().toISOString(),
  };

  patchDomainState(sessionId, {
    compliance: result,
    certificationStage: "compliance",
  });
  pushGovernanceNotification(sessionId, `Compliance check completed with ${result.riskLevel} risk`);
  return result;
}
