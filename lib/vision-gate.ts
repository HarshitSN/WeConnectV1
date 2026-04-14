export type VisionGateInput = {
  confidence: number;
  matchesPrimaryOwner: boolean;
  ownerKnownAndVerified: boolean;
};

export type VisionGateDecision = {
  pass: boolean;
  nameMatchBypassed: boolean;
  warningCode?: "owner_unverified_name_mismatch_bypassed";
};

export function decideVisionGate(input: VisionGateInput): VisionGateDecision {
  const confidencePass = Number(input.confidence) >= 45;
  const strictPass = confidencePass && input.matchesPrimaryOwner;
  if (strictPass) {
    return { pass: true, nameMatchBypassed: false };
  }

  const canBypassNameMismatch =
    confidencePass && !input.matchesPrimaryOwner && !input.ownerKnownAndVerified;
  if (canBypassNameMismatch) {
    return {
      pass: true,
      nameMatchBypassed: true,
      warningCode: "owner_unverified_name_mismatch_bypassed",
    };
  }

  return { pass: false, nameMatchBypassed: false };
}
