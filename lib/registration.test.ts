import { describe, expect, it } from "vitest";
import type { RegistryCompany } from "./types";
import { mapCompanyToPrefill } from "./registration";
import type { CodeClassification } from "./code-classification";

const WEB_COMPANY: RegistryCompany = {
  id: "web-arbys",
  companyName: "Arby's",
  aliases: ["arbys"],
  websiteUrl: "https://www.arbys.com",
  jurisdiction: "Web search result",
  registrySnippet: "Arby's is a leading sandwich drive-thru restaurant brand.",
  primaryOwner: "Unknown owner (confirm via voice)",
  ownershipFemalePct: 0,
  directors: [],
  riskFlags: ["web_source_unverified"],
};

function classificationFixture(overrides?: Partial<CodeClassification>): CodeClassification {
  return {
    naics: {
      codes: [],
      sourceType: "unresolved",
      confidence: 0,
      evidence: ["No NAICS signal found."],
    },
    unspsc: {
      codes: [],
      sourceType: "unresolved",
      confidence: 0,
      evidence: ["No UNSPSC signal found."],
    },
    ...overrides,
  };
}

describe("mapCompanyToPrefill", () => {
  it("infers country from strong NAICS signal for web discoveries and keeps it inferred", () => {
    const out = mapCompanyToPrefill(
      WEB_COMPANY,
      "web",
      { evidence: [], confidence: {} },
      classificationFixture({
        naics: {
          codes: ["722511"],
          sourceType: "serp_explicit",
          confidence: 70,
          evidence: ['SERP classification query matched: "arbys NAICS code".'],
        },
      }),
    );

    expect(out.prefill.country).toBe("United States");
    expect(out.countryResolution.source).toBe("inferred");
    expect(out.prefill.owner_details[0]?.ownershipPct).toBe(100);
  });

  it("keeps country unresolved when signals are ambiguous", () => {
    const out = mapCompanyToPrefill(
      { ...WEB_COMPANY, websiteUrl: "https://example.com" },
      "web",
      { evidence: [], confidence: {} },
      classificationFixture(),
    );

    expect(out.prefill.country).toBe("");
    expect(out.countryResolution.source).toBe("unresolved");
  });
});
