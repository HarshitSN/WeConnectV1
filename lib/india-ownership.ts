import type { WebCompanyCandidate } from "./web-search";

export type OwnershipSourceType = "exact_exchange_filing" | "web_inferred" | "registry_prefill";
export type ExchangeType = "NSE" | "BSE";

export type OwnershipBreakdownEntry = {
  category: string;
  pct: number;
};

export type NormalizedOwnershipData = {
  ownership_total_promoter_pct?: number;
  ownership_total_public_pct?: number;
  ownership_breakdown: OwnershipBreakdownEntry[];
  as_of_date?: string;
  source_url: string;
  source_type: "exchange_filing";
  exchange: ExchangeType;
  symbol: string;
};

export type OwnershipSummary = {
  value?: number;
  sourceType: OwnershipSourceType;
  confidence: number;
  asOfDate?: string;
  sourceUrl?: string;
};

export type ListedCompanyResolution = {
  exchange: ExchangeType;
  symbol: string;
  confidence: number;
  sourceUrl?: string;
};

function toUpperAlnum(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "").replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyNseDomain(url?: string): boolean {
  return /(^|\.)nseindia\.com$/i.test(safeDomain(url));
}

function isLikelyBseDomain(url?: string): boolean {
  return /(^|\.)bseindia\.com$/i.test(safeDomain(url));
}

function extractNseSymbolFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const fromParam = parsed.searchParams.get("symbol")?.trim();
    if (fromParam) return toUpperAlnum(decodeURIComponent(fromParam));
  } catch {
    return undefined;
  }
  return undefined;
}

function extractBseCodeFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/(\d{6})(?:\b|\/|\?|$)/);
  return match?.[1];
}

function extractSymbolFromText(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized) return undefined;
  const nseColon = normalized.match(/(?:NSE|NSEI)\s*[:\-]\s*([A-Z][A-Z0-9]{1,14})/i);
  if (nseColon?.[1]) return toUpperAlnum(nseColon[1]);
  const withNs = normalized.match(/\b([A-Z][A-Z0-9]{1,14})\.NS\b/i);
  if (withNs?.[1]) return toUpperAlnum(withNs[1]);
  const inParens = normalized.match(/\(([A-Z][A-Z0-9]{1,14})\)/);
  if (inParens?.[1]) return toUpperAlnum(inParens[1]);
  return undefined;
}

export function resolveListedCompany(input: {
  query: string;
  selected?: WebCompanyCandidate;
  candidates: WebCompanyCandidate[];
}): ListedCompanyResolution | null {
  const ordered = [input.selected, ...input.candidates].filter(Boolean) as WebCompanyCandidate[];

  for (const c of ordered) {
    if (isLikelyNseDomain(c.url)) {
      const symbol = extractNseSymbolFromUrl(c.url) || extractSymbolFromText(`${c.title} ${c.snippet}`);
      if (symbol) {
        return { exchange: "NSE", symbol, confidence: 86, sourceUrl: c.url };
      }
    }
  }

  for (const c of ordered) {
    if (isLikelyBseDomain(c.url)) {
      const code = extractBseCodeFromUrl(c.url);
      if (code) {
        return { exchange: "BSE", symbol: code, confidence: 80, sourceUrl: c.url };
      }
    }
  }

  for (const c of ordered) {
    const symbol = extractSymbolFromText(`${c.title} ${c.snippet}`);
    if (symbol) {
      return { exchange: "NSE", symbol, confidence: 68, sourceUrl: c.url };
    }
  }

  const queryGuess = toUpperAlnum(input.query);
  if (/^[A-Z][A-Z0-9]{1,14}$/.test(queryGuess)) {
    return { exchange: "NSE", symbol: queryGuess, confidence: 55 };
  }

  return null;
}

function parseAsOfDate(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.asOfDate,
    payload.as_of_date,
    payload.asOnDate,
    payload.date,
    payload.reportDate,
    payload.reportingDate,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function parseShareholdingRows(payload: Record<string, unknown>): Array<{ category: string; pct: number }> {
  const rowsRaw =
    (Array.isArray(payload.data) ? payload.data : null) ||
    (Array.isArray(payload.shareholding) ? payload.shareholding : null) ||
    (Array.isArray(payload.rows) ? payload.rows : null) ||
    [];

  const rows: Array<{ category: string; pct: number }> = [];
  for (const row of rowsRaw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const category =
      (typeof rec.category === "string" && rec.category.trim()) ||
      (typeof rec.categoryName === "string" && rec.categoryName.trim()) ||
      (typeof rec.label === "string" && rec.label.trim()) ||
      (typeof rec.name === "string" && rec.name.trim()) ||
      "";

    const pct =
      toNumber(rec.pct) ??
      toNumber(rec.percentage) ??
      toNumber(rec.value) ??
      toNumber(rec.shareholding) ??
      toNumber(rec.per_of_share) ??
      toNumber(rec.noOfSharesPerc) ??
      toNumber(rec.noOfSharePerc);

    if (category && pct !== null) rows.push({ category, pct });
  }
  return rows;
}

function summarizeOwnership(rows: Array<{ category: string; pct: number }>): {
  promoter?: number;
  publicPct?: number;
  breakdown: OwnershipBreakdownEntry[];
} {
  let promoter: number | undefined;
  let publicPct: number | undefined;
  const breakdown: OwnershipBreakdownEntry[] = [];

  for (const row of rows) {
    const key = row.category.toLowerCase();
    breakdown.push({ category: row.category, pct: row.pct });
    if (/promoter/.test(key)) {
      promoter = (promoter ?? 0) + row.pct;
    }
    if (/\bpublic\b/.test(key)) {
      publicPct = (publicPct ?? 0) + row.pct;
    }
  }

  if (promoter !== undefined && publicPct === undefined) {
    const inferredPublic = Number((100 - promoter).toFixed(2));
    if (inferredPublic >= 0 && inferredPublic <= 100) {
      publicPct = inferredPublic;
    }
  }

  return { promoter, publicPct, breakdown };
}

export function parseExchangeShareholdingPayload(
  payload: unknown,
  sourceUrl: string,
  exchange: ExchangeType,
  symbol: string,
): NormalizedOwnershipData | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  const rows = parseShareholdingRows(rec);
  if (!rows.length) return null;

  const summary = summarizeOwnership(rows);
  if (summary.promoter === undefined && summary.publicPct === undefined) return null;

  return {
    ownership_total_promoter_pct: summary.promoter,
    ownership_total_public_pct: summary.publicPct,
    ownership_breakdown: summary.breakdown,
    as_of_date: parseAsOfDate(rec),
    source_url: sourceUrl,
    source_type: "exchange_filing",
    exchange,
    symbol,
  };
}

function nseHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Referer: "https://www.nseindia.com/",
  };
}

async function fetchJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>) {
  const res = await fetchImpl(url, { method: "GET", headers, cache: "no-store" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "";
  if (!/json/i.test(contentType)) return null;
  return (await res.json()) as unknown;
}

async function fetchNseShareholding(symbol: string, fetchImpl: typeof fetch): Promise<NormalizedOwnershipData | null> {
  const headers = nseHeaders();
  try {
    await fetchImpl("https://www.nseindia.com/", { method: "GET", headers, cache: "no-store" });
  } catch {
    // continue with direct API attempts
  }

  const endpoints = [
    `https://www.nseindia.com/api/corporates-share-holdings?index=equities&symbol=${encodeURIComponent(symbol)}`,
    `https://www.nseindia.com/api/corporate-share-holdings?symbol=${encodeURIComponent(symbol)}`,
    `https://www.nseindia.com/api/shareholding-pattern-equities?symbol=${encodeURIComponent(symbol)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const json = await fetchJson(fetchImpl, endpoint, headers);
      const parsed = parseExchangeShareholdingPayload(json, endpoint, "NSE", symbol);
      if (parsed) return parsed;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

async function fetchBseShareholding(code: string, fetchImpl: typeof fetch): Promise<NormalizedOwnershipData | null> {
  const endpoints = [
    `https://api.bseindia.com/BseIndiaAPI/api/Shareholdingnew/w?scode=${encodeURIComponent(code)}&flag=0`,
    `https://api.bseindia.com/BseIndiaAPI/api/ComHeader/w?quotetype=EQ&scripcode=${encodeURIComponent(code)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const json = await fetchJson(fetchImpl, endpoint, {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.bseindia.com/",
      });
      const parsed = parseExchangeShareholdingPayload(json, endpoint, "BSE", code);
      if (parsed) return parsed;
    } catch {
      // continue
    }
  }
  return null;
}

export async function resolveIndiaOwnershipFromWeb(input: {
  query: string;
  selected?: WebCompanyCandidate;
  candidates: WebCompanyCandidate[];
  fetchImpl?: typeof fetch;
}): Promise<NormalizedOwnershipData | null> {
  const resolution = resolveListedCompany(input);
  if (!resolution) return null;

  const fetcher = input.fetchImpl ?? fetch;
  if (resolution.exchange === "NSE") {
    return await fetchNseShareholding(resolution.symbol, fetcher);
  }
  return await fetchBseShareholding(resolution.symbol, fetcher);
}

export function toOwnershipSummary(
  normalized: NormalizedOwnershipData | null,
  fallback: Pick<OwnershipSummary, "sourceType" | "confidence" | "value">,
): OwnershipSummary {
  if (!normalized) {
    return {
      sourceType: fallback.sourceType,
      confidence: fallback.confidence,
      value: fallback.value,
    };
  }
  return {
    value: normalized.ownership_total_promoter_pct,
    sourceType: "exact_exchange_filing",
    confidence: 88,
    asOfDate: normalized.as_of_date,
    sourceUrl: normalized.source_url,
  };
}
