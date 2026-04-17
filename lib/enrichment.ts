import { type WebCompanyCandidate, searchWebByQuery } from "./web-search";

export type EnrichmentSummary = {
  legalName?: string;
  country?: string;
  countrySource?: "explicit_phrase" | "signal_domain_tld" | "signal_us_cues";
  ownerName?: string;
  industryHint?: string;
  naicsCodes?: string[];
  unspscCodes?: string[];
  employeeHint?: string;
  revenueHint?: string;
  companyType?: string;
  evidence: string[];
  confidence: Partial<Record<"legalName" | "country" | "ownerName" | "industryHint", number>>;
};

const COUNTRY_WORDS = [
  "united states",
  "united kingdom",
  "india",
  "canada",
  "saudi arabia",
  "brazil",
  "uae",
  "singapore",
  "australia",
];

const COUNTRY_BY_CC_TLD: Array<{ suffix: string; country: string }> = [
  { suffix: ".us", country: "United States" },
  { suffix: ".uk", country: "United Kingdom" },
  { suffix: ".in", country: "India" },
  { suffix: ".ca", country: "Canada" },
  { suffix: ".br", country: "Brazil" },
  { suffix: ".ae", country: "UAE" },
  { suffix: ".sg", country: "Singapore" },
  { suffix: ".au", country: "Australia" },
];

const US_STATE_ABBREVIATIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
].join("|");

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function detectCountryStrong(text: string): string | undefined {
  for (const country of COUNTRY_WORDS) {
    const p1 = new RegExp(
      `(?:headquartered|headquarters|based|incorporated|registered)\\s+(?:in\\s+)?${escapeRegExp(country)}\\b`,
      "i",
    );
    const p2 = new RegExp(
      `(?:country|location|hq|headquarters)\\s*[:\\-]\\s*${escapeRegExp(country)}\\b`,
      "i",
    );
    if (p1.test(text) || p2.test(text)) {
      return country;
    }
  }
  
  if (/\b(Pvt\.? Ltd\.?|Private Limited)\b/i.test(text) && /\bIndia\b/i.test(text)) {
    return "India";
  }

  return undefined;
}

function detectCountryFromDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const host = domain.toLowerCase();
  if (host.endsWith(".gov")) return "United States";
  const matched = COUNTRY_BY_CC_TLD.find((entry) => host.endsWith(entry.suffix));
  return matched?.country;
}

function detectCountryFromUsSignals(text: string): string | undefined {
  let score = 0;
  if (/\b(united states|u\.s\.a\.|u\.s\.|american)\b/i.test(text) || /\b(US|USA)\b/.test(text)) score += 2;
  if (new RegExp(`\\b[A-Z][a-z]{2,},\\s*(?:${US_STATE_ABBREVIATIONS})\\b`).test(text)) score += 1;
  if (/\b[A-Z][a-z]{2,},\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+\d{5}(?:-\d{4})?\b/.test(
    text,
  )) {
    score += 1;
  }
  return score >= 2 ? "United States" : undefined;
}

function normalizeLegalName(title: string): string | undefined {
  const raw = title.trim();
  if (!raw) return undefined;
  let cleaned = raw.split("|")[0]?.trim() || raw;
  cleaned = cleaned.replace(/^(contact|about|careers?|life at)\s+/i, "").trim();
  if (cleaned.includes(":")) {
    cleaned = cleaned.split(":")[0]?.trim() || cleaned;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 ? cleaned : undefined;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function extractNaicsCodes(text: string): string[] {
  const codes: string[] = [];
  const naicsLabeled = [...text.matchAll(/\bnaics(?:\s+code|\s+codes)?\s*[:\-]?\s*([0-9,\s;/-]{2,40})/gi)];
  for (const m of naicsLabeled) {
    const raw = m[1] ?? "";
    for (const codeMatch of raw.matchAll(/\b\d{2,6}\b/g)) {
      const code = codeMatch[0];
      if (code.length >= 2 && code.length <= 6) codes.push(code);
    }
  }
  return uniqueSorted(codes);
}

function extractUnspscCodes(text: string): string[] {
  const out: string[] = [];
  const unspscLabeled = [...text.matchAll(/\bunspsc(?:\s+code|\s+codes)?\s*[:\-]?\s*([0-9,\s;/-]{4,80})/gi)];
  for (const m of unspscLabeled) {
    const raw = m[1] ?? "";
    for (const codeMatch of raw.matchAll(/\b\d{8}\b/g)) {
      out.push(codeMatch[0]);
    }
  }
  return uniqueSorted(out);
}

const COMPANY_TYPE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bPrivate\s+Limited\s+Company\b/i, label: "Private Limited" },
  { pattern: /\bPvt\.?\s*Ltd\.?\b/i, label: "Private Limited" },
  { pattern: /\bLimited\s+Liability\s+Partnership\b/i, label: "LLP" },
  { pattern: /\bLLP\b/, label: "LLP" },
  { pattern: /\bPartnership\s+Firm\b/i, label: "Partnership Firm" },
  { pattern: /\bPublic\s+Limited\s+Company\b/i, label: "Public Limited" },
  { pattern: /\bOne\s+Person\s+Company\b/i, label: "One Person Company" },
  { pattern: /\bOPC\b/, label: "One Person Company" },
  { pattern: /\bSole\s+Proprietorship\b/i, label: "Sole Proprietorship" },
  { pattern: /\bSection\s+8\s+Company\b/i, label: "Section 8 Company" },
];

function extractCompanyType(text: string): string | undefined {
  for (const { pattern, label } of COMPANY_TYPE_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return undefined;
}

async function fetchCandidateText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 WeConnectBot/1.0" },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const html = await res.text();
  return stripHtml(html).slice(0, 20000);
}

export async function enrichCompanyCandidate(
  candidate: WebCompanyCandidate,
): Promise<EnrichmentSummary> {
  const evidence: string[] = [];
  let pageText = "";
  if (candidate.url.startsWith("http")) {
    try {
      pageText = await fetchCandidateText(candidate.url);
      if (pageText) evidence.push(`Fetched page: ${candidate.url}`);
    } catch {
      evidence.push(`Page fetch failed: ${candidate.url}`);
    }
  }

  const original = `${candidate.title}. ${candidate.snippet}. ${pageText}`;

  const legalName = normalizeLegalName(candidate.title ?? "");
  let country = detectCountryStrong(original);
  let countrySource: EnrichmentSummary["countrySource"];
  if (country) {
    countrySource = "explicit_phrase";
  } else {
    const domainCountry = detectCountryFromDomain(candidate.domain);
    if (domainCountry) {
      country = domainCountry;
      countrySource = "signal_domain_tld";
    } else {
      const usSignalCountry = detectCountryFromUsSignals(original);
      if (usSignalCountry) {
        country = usSignalCountry;
        countrySource = "signal_us_cues";
      }
    }
  }
  const ownerName = firstMatch(original, [
    /(?:founder|ceo|owner|co-founder)\s*[:\-]\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/i,
    /(?:founded by)\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/i,
  ]);
  const naicsCodes = extractNaicsCodes(original);
  const unspscCodes = extractUnspscCodes(original);
  const industryHint = firstMatch(original, [
    /(?:we are|we provide|specialize in)\s+([^\.]{12,90})/i,
    /(?:company)\s+(?:is|offers)\s+([^\.]{12,90})/i,
  ]);
  const employeeHint = firstMatch(original, [
    /(\d{1,4}\+?\s+employees)/i,
    /team of\s+(\d{1,4})/i,
  ]);
  const revenueHint = firstMatch(original, [
    /(\$[\d\.,]+\s*(?:million|billion|m|bn)?)/i,
    /(revenue[^\.]{0,50})/i,
  ]);
  let companyType = extractCompanyType(original);

  // Backup fallback deep snippet search if still missing AND no INSTA_API_KEY matched our fields
  // Removed deep search since paidUpCapital, fundingInfo, partnerNames no longer exist and it was used only for those

  if (legalName) evidence.push(`Legal name inferred from title: ${legalName}`);
  if (country && countrySource === "explicit_phrase") {
    evidence.push(`Country inferred from explicit company-location phrase: ${country}`);
  } else if (country && countrySource === "signal_domain_tld") {
    evidence.push(`Country inferred from trusted domain/TLD signal: ${country}`);
  } else if (country && countrySource === "signal_us_cues") {
    evidence.push(`Country inferred from strong U.S. text/address cues: ${country}`);
  }
  if (ownerName) evidence.push(`Owner/founder hint: ${ownerName}`);
  if (naicsCodes.length) evidence.push(`NAICS codes detected from web text: ${naicsCodes.join(", ")}`);
  if (unspscCodes.length) evidence.push(`UNSPSC codes detected from web text: ${unspscCodes.join(", ")}`);
  if (industryHint) evidence.push(`Industry hint extracted from text.`);
  if (employeeHint) evidence.push(`Employee hint extracted.`);
  if (revenueHint) evidence.push(`Revenue hint extracted.`);
  if (companyType) evidence.push(`Company type detected: ${companyType}`);

  return {
    legalName,
    country: country
      ? country
          .split(" ")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" ")
      : undefined,
    countrySource,
    ownerName,
    naicsCodes,
    unspscCodes,
    industryHint,
    employeeHint,
    revenueHint,
    companyType,
    evidence,
    confidence: {
      legalName: legalName ? 75 : 0,
      country: country ? 65 : 0,
      ownerName: ownerName ? 55 : 0,
      industryHint: industryHint ? 52 : 0,
    },
  };
}
