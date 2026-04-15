import { describe, expect, it } from "vitest";

type SessionStage =
  | "idle"
  | "discovered"
  | "voice_confirm"
  | "vision_id"
  | "voice_attestation"
  | "anchoring"
  | "complete";

function shouldBlockAnchoringTransition(
  nextStage: SessionStage | null | undefined,
  missingRequired: string[],
) {
  return nextStage === "anchoring" && missingRequired.length > 0;
}

function readinessPrompt(missingRequired: string[]) {
  if (missingRequired.includes("paid")) {
    return "Verification is complete. Please complete payment to issue your certificate.";
  }
  if (missingRequired.includes("country")) {
    return "Please complete country details before certificate issuance.";
  }
  if (missingRequired.includes("country_confirmation")) {
    return "Please confirm the country field before certificate issuance.";
  }
  if (missingRequired.includes("naics_codes_invalid") || missingRequired.includes("unspsc_codes_invalid")) {
    return "Please correct NAICS/UNSPSC code format before issuing certificate.";
  }
  return "Please complete remaining required fields before issuing certificate.";
}

describe("agent anchoring readiness guards", () => {
  it("blocks anchoring transition when paid is missing", () => {
    expect(shouldBlockAnchoringTransition("anchoring", ["paid"])).toBe(true);
    expect(readinessPrompt(["paid"])).toContain("complete payment");
  });

  it("allows anchoring transition when no required fields are missing", () => {
    expect(shouldBlockAnchoringTransition("anchoring", [])).toBe(false);
  });
});
