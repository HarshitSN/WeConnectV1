import { getDomainState, patchDomainState, pushGovernanceNotification } from "@/lib/store/domain-store";
import {
  trustLevelFromCertification,
  type CertificationStage,
  type CertificationType,
  type PaymentState,
  type QuestionnaireAnswers,
} from "@/lib/domains/contracts";

export function selectCertificationType(sessionId: string, certificationType: CertificationType) {
  const stage: CertificationStage = certificationType === "digital" ? "digital_verification" : "self_certification";
  const trustLevel = trustLevelFromCertification(certificationType);
  const next = patchDomainState(sessionId, {
    certificationType,
    trustLevel,
    certificationStage: stage,
    verificationStatus: certificationType === "digital" ? "running" : "passed",
  });
  pushGovernanceNotification(
    sessionId,
    `Certification path selected: ${certificationType === "digital" ? "Digital" : certificationType === "self" ? "Self" : "None"}`,
  );
  return next;
}

export function updateCertificationStage(sessionId: string, stage: CertificationStage) {
  const next = patchDomainState(sessionId, { certificationStage: stage });
  pushGovernanceNotification(sessionId, `Certification stage updated: ${stage}`);
  return next;
}

export function updateQuestionnaireAnswers(sessionId: string, answers: QuestionnaireAnswers) {
  const next = patchDomainState(sessionId, {
    certificationStage: "questionnaire",
    questionnaireAnswers: answers,
  });
  pushGovernanceNotification(sessionId, "Adaptive questionnaire updated");
  return next;
}

export function transitionPayment(sessionId: string, paymentState: PaymentState) {
  const ts = new Date().toISOString();
  const current = getDomainState(sessionId);
  const payment = { ...current.payment, state: paymentState };
  if (paymentState === "hold_placed") payment.holdAt = ts;
  if (paymentState === "captured") payment.captureAt = ts;
  if (paymentState === "refunded") payment.refundAt = ts;

  const next = patchDomainState(sessionId, { payment });
  const readable =
    paymentState === "hold_placed"
      ? "$100 payment hold placed"
      : paymentState === "captured"
        ? "Payment captured after approval"
        : paymentState === "refunded"
          ? "Payment refunded after rejection"
          : "Payment reset";
  pushGovernanceNotification(sessionId, readable);
  return next;
}
