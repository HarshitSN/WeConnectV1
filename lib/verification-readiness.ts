import { emptyRegistrationDraft, validateRegistration } from "./registration";
import type { SessionRecord } from "./session-store";
import { getDomainState } from "@/lib/store/domain-store";

export function verificationReadiness(session: SessionRecord) {
  const workflow = getDomainState(session.id);
  const isDigital = workflow.certificationType === "digital";
  const paid = session.paid ?? false;
  const reg = validateRegistration(session.registration ?? emptyRegistrationDraft(), isDigital ? paid : true);
  const blockers = [...reg.missingRequired];
  if (!session.companyId) blockers.push("company");
  if (isDigital && !session.visionChecks?.idPassed) blockers.push("vision_id");
  if (session.stage !== "anchoring") blockers.push("stage_not_anchoring");
  return {
    isReady: blockers.length === 0,
    blockers,
    ownershipTotal: reg.ownershipTotal,
    paid,
  };
}

//test
