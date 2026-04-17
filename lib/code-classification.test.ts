import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCompanyCodes } from "./code-classification";

vi.mock("./web-search", () => ({
  searchWebByQuery: vi.fn(),
}));

import { searchWebByQuery } from "./web-search";

describe("resolveCompanyCodes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers authoritative explicit signals when present", async () => {
    vi.mocked(searchWebByQuery).mockResolvedValue({
      provider: "aws_bedrock_claude",
      candidates: [
        {
          title: "SEC filing - Company NAICS code 722513 UNSPSC code 90101500",
          snippet: "NAICS code 722513 and UNSPSC 90101500",
          url: "https://www.sec.gov/example",
          domain: "sec.gov",
        },
      ],
    });

    const out = await resolveCompanyCodes({
      query: "Arby's",
      candidates: [
        {
          title: "Arby's",
          snippet: "Restaurant brand",
          url: "https://arbys.com",
          domain: "arbys.com",
        },
      ],
      enrichments: [{ evidence: [], confidence: {} }],
    });

    expect(out.naics.codes.length).toBeGreaterThan(0);
    expect(out.unspsc.codes).toContain("90101500");
    expect(out.naics.sourceType).toBe("authoritative");
  });

  it("returns unresolved classification when explicit codes are absent", async () => {
    vi.mocked(searchWebByQuery).mockResolvedValue({
      provider: "aws_bedrock_claude",
      candidates: [],
      fallbackReason: "BEDROCK_EMPTY",
    });

    const out = await resolveCompanyCodes({
      query: "Arby's",
      candidates: [
        {
          title: "Arby's",
          snippet: "Company overview and latest updates",
          url: "https://arbys.com",
          domain: "arbys.com",
        },
      ],
      enrichments: [{ industryHint: "Business profile", evidence: [], confidence: {} }],
    });

    expect(out.naics.sourceType).toBe("unresolved");
    expect(out.naics.codes.length).toBe(0);
    expect(out.unspsc.sourceType).toBe("unresolved");
    expect(out.unspsc.codes.length).toBe(0);
  });

  it("maps UNSPSC from NAICS when explicit UNSPSC is unavailable", async () => {
    vi.mocked(searchWebByQuery).mockResolvedValue({
      provider: "aws_bedrock_claude",
      candidates: [
        {
          title: "Arby's NAICS code 722511",
          snippet: "NAICS code 722511",
          url: "https://siccode.com/naics/722511/full-service-restaurants",
          domain: "siccode.com",
        },
      ],
    });

    const out = await resolveCompanyCodes({
      query: "Arby's",
      candidates: [
        {
          title: "Arby's",
          snippet: "Restaurant brand",
          url: "https://www.arbys.com",
          domain: "arbys.com",
        },
      ],
      enrichments: [{ naicsCodes: ["722511"], evidence: [], confidence: {} }],
    });

    expect(out.naics.codes).toContain("722511");
    expect(out.unspsc.codes).toContain("90101500");
    expect(out.unspsc.sourceType).toBe("inferred");
    expect(out.unspsc.confidence).toBeLessThan(out.naics.confidence);
  });

  it("prefers explicit UNSPSC over mapped fallback", async () => {
    vi.mocked(searchWebByQuery).mockResolvedValue({
      provider: "aws_bedrock_claude",
      candidates: [
        {
          title: "Procurement filing UNSPSC code 90101500",
          snippet: "UNSPSC code 90101500",
          url: "https://example.com/procurement",
          domain: "example.com",
        },
      ],
    });

    const out = await resolveCompanyCodes({
      query: "Arby's",
      candidates: [
        {
          title: "Arby's NAICS code 722511 UNSPSC code 90101500",
          snippet: "NAICS code 722511 and UNSPSC 90101500",
          url: "https://arbys.com",
          domain: "arbys.com",
        },
      ],
      enrichments: [{ naicsCodes: ["722511"], evidence: [], confidence: {} }],
    });

    expect(out.unspsc.codes).toEqual(["90101500"]);
    expect(out.unspsc.sourceType).toBe("serp_explicit");
    expect(out.unspsc.confidence).toBeGreaterThan(46);
  });

  it("infers NAICS from industry language and maps UNSPSC when explicit codes are absent", async () => {
    vi.mocked(searchWebByQuery).mockResolvedValue({
      provider: "aws_bedrock_claude",
      candidates: [
        {
          title: "StatusNeo | Authentic AI Transformations for Enterprises",
          snippet: "Build AI-native systems, agentic workflows and governed loops.",
          url: "https://statusneo.com",
          domain: "statusneo.com",
        },
      ],
    });

    const out = await resolveCompanyCodes({
      query: "StatusNeo",
      candidates: [
        {
          title: "StatusNeo | Authentic AI Transformations for Enterprises",
          snippet: "Digital engineering and AI-native transformation partner.",
          url: "https://statusneo.com",
          domain: "statusneo.com",
        },
      ],
      enrichments: [{ industryHint: "Software development and AI transformation services", evidence: [], confidence: {} }],
    });

    expect(out.naics.codes).toContain("541511");
    expect(out.naics.sourceType).toBe("inferred");
    expect(out.unspsc.codes).toContain("81112200");
  });
});
