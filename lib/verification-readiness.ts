import { emptyRegistrationDraft, validateRegistration } from "./registration";
import type { SessionRecord } from "./session-store";

export function verificationReadiness(session: SessionRecord) {
  const paid = session.paid ?? false;
  const reg = validateRegistration(session.registration ?? emptyRegistrationDraft(), paid);
  const blockers = [...reg.missingRequired];
  if (!session.companyId) blockers.push("company");
  // ID vision pass is the only camera-gated readiness check in the ID-only flow.
  if (!session.visionChecks?.idPassed) blockers.push("vision_id");
  if (session.stage !== "anchoring") blockers.push("stage_not_anchoring");
  return {
    isReady: blockers.length === 0,
    blockers,
    ownershipTotal: reg.ownershipTotal,
    paid,
  };
}
