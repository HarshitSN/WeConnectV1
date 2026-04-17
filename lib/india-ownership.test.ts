import { describe, expect, it, vi } from "vitest";
import {
  parseExchangeShareholdingPayload,
  resolveIndiaOwnershipFromWeb,
  resolveListedCompany,
  toOwnershipSummary,
} from "./india-ownership";

describe("india ownership", () => {
  it("resolves NSE symbol from candidate URL", () => {
    const result = resolveListedCompany({
      query: "Reliance Industries",
      selected: {
        title: "NSE India quote",
        snippet: "Shareholding pattern",
        url: "https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
        domain: "nseindia.com",
      },
      candidates: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        exchange: "NSE",
        symbol: "RELIANCE",
      }),
    );
  });

  it("normalizes exchange shareholding payload to promoter/public totals", () => {
    const parsed = parseExchangeShareholdingPayload(
      {
        asOfDate: "2025-12-31",
        data: [
          { category: "Promoter and Promoter Group", pct: "52.33" },
          { category: "Public", pct: "47.67" },
        ],
      },
      "https://www.nseindia.com/api/corporates-share-holdings?symbol=RELIANCE",
      "NSE",
      "RELIANCE",
    );

    expect(parsed?.ownership_total_promoter_pct).toBe(52.33);
    expect(parsed?.ownership_total_public_pct).toBe(47.67);
    expect(parsed?.source_type).toBe("exchange_filing");
  });

  it("fetches ownership from NSE-like endpoint payload and marks exact source", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            as_of_date: "2025-12-31",
            rows: [
              { label: "Promoter and Promoter Group", percentage: 60.1 },
              { label: "Public", percentage: 39.9 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const normalized = await resolveIndiaOwnershipFromWeb({
      query: "Reliance Industries",
      selected: {
        title: "NSE quote",
        snippet: "NSE: RELIANCE",
        url: "https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
        domain: "nseindia.com",
      },
      candidates: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const ownership = toOwnershipSummary(normalized, {
      sourceType: "web_inferred",
      confidence: 20,
      value: undefined,
    });

    expect(ownership.sourceType).toBe("exact_exchange_filing");
    expect(ownership.value).toBe(60.1);
    expect(ownership.confidence).toBeGreaterThanOrEqual(80);
  });
});
