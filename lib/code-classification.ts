import type { EnrichmentSummary } from "./enrichment";
import type { WebCompanyCandidate } from "./web-search";
import { searchWebByQuery } from "./web-search";

export type CodeSourceType = "authoritative" | "serp_explicit" | "inferred" | "unresolved";

export type CodeFieldResolution = {
  codes: string[];
  sourceType: CodeSourceType;
  confidence: number;
  evidence: string[];
};

export type CodeClassification = {
  naics: CodeFieldResolution;
  unspsc: CodeFieldResolution;
};

type ResolveInput = {
  query: string;
  candidates: WebCompanyCandidate[];
  enrichments: EnrichmentSummary[];
};

const AUTHORITATIVE_DOMAIN_PATTERNS = [
  /(^|\.)sec\.gov$/i,
  /(^|\.)census\.gov$/i,
  /(^|\.)sam\.gov$/i,
  /(^|\.)usaspending\.gov$/i,
  /(^|\.)gov$/i,
];

function uniq(values: string[]) {
  return [...new Set(values)];
}

function isAuthoritativeDomain(domain?: string) {
  if (!domain) return false;
  return AUTHORITATIVE_DOMAIN_PATTERNS.some((p) => p.test(domain));
}

function parseNaicsFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bnaics(?:\s+code|\s+codes)?\s*[:\-]?\s*([0-9,\s;/-]{2,40})/gi)) {
    const chunk = m[1] ?? "";
    for (const c of chunk.matchAll(/\b\d{2,6}\b/g)) {
      out.push(c[0]);
    }
  }
  return uniq(out);
}

function parseNaicsFromContext(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:naics|sic\/naics|industry(?:\s+code)?)\b[\s\S]{0,80}?\b(\d{5,6})\b/gi)) {
    out.push(m[1]);
  }
  for (const m of text.matchAll(/\/naics\/(\d{5,6})\b/gi)) {
    out.push(m[1]);
  }
  return uniq(out);
}

function parseUnspscFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bunspsc(?:\s+code|\s+codes)?\s*[:\-]?\s*([0-9,\s;/-]{4,80})/gi)) {
    const chunk = m[1] ?? "";
    for (const c of chunk.matchAll(/\b\d{8}\b/g)) out.push(c[0]);
  }
  return uniq(out);
}

function inferNaicsFromIndustryText(text: string): string[] {
  const normalized = text.toLowerCase();
  if (
    /(software|computer programming|application development|digital engineering|it services|technology consulting|ai[- ]native|artificial intelligence)/i.test(
      normalized,
    )
  ) {
    return ["541511"];
  }
  if (/(restaurant|fast food|food service|drive-thru|sandwich)/i.test(normalized)) {
    return ["722511"];
  }
  return [];
}

function pickBestResolution(found: Array<{ codes: string[]; sourceType: CodeSourceType; confidence: number; evidence: string }>): CodeFieldResolution {
  const sorted = found
    .filter((f) => f.codes.length > 0)
    .sort((a, b) => b.confidence - a.confidence);
  if (!sorted.length) {
    return {
      codes: [],
      sourceType: "unresolved",
      confidence: 0,
      evidence: ["No explicit web classification signal found."],
    };
  }
  const best = sorted[0];
  return {
    codes: best.codes,
    sourceType: best.sourceType,
    confidence: best.confidence,
    evidence: [best.evidence],
  };
}

function mapNaicsToUnspsc(naicsCodes: string[]): string[] {
  const out = new Set<string>();
  for (const code of naicsCodes) {
    if (/^7225/.test(code)) {
      // Restaurant and food service NAICS -> food and beverage services UNSPSC.
      out.add("90101500");
    } else if (/^(484|4885|492|493)/.test(code)) {
      out.add("78101800");
    } else if (/^5415/.test(code)) {
      out.add("81112200");
    }
  }
  return [...out];
}

export async function resolveCompanyCodes(input: ResolveInput): Promise<CodeClassification> {
  const naicsCandidates: Array<{ codes: string[]; sourceType: CodeSourceType; confidence: number; evidence: string }> = [];
  const unspscCandidates: Array<{ codes: string[]; sourceType: CodeSourceType; confidence: number; evidence: string }> = [];

  // 1) Authoritative / explicit from current candidate set (top 2-3)
  for (let i = 0; i < Math.min(input.candidates.length, 3); i += 1) {
    const c = input.candidates[i];
    const e = input.enrichments[i];
    const text = `${c.title}. ${c.snippet}. ${c.url}. ${(e?.evidence ?? []).join(" | ")}`;
    const naics = uniq([...parseNaicsFromText(text), ...parseNaicsFromContext(text)]);
    const unspsc = parseUnspscFromText(text);
    const authoritative = isAuthoritativeDomain(c.domain);
    const sourceType: CodeSourceType = authoritative ? "authoritative" : "serp_explicit";
    const baseConfidence = authoritative ? 88 : 72;
    if (naics.length) {
      naicsCandidates.push({
        codes: naics,
        sourceType,
        confidence: baseConfidence,
        evidence: `${sourceType} signal from candidate ${i + 1} (${c.domain ?? "unknown-domain"}).`,
      });
    }
    if (unspsc.length) {
      unspscCandidates.push({
        codes: unspsc,
        sourceType,
        confidence: baseConfidence,
        evidence: `${sourceType} signal from candidate ${i + 1} (${c.domain ?? "unknown-domain"}).`,
      });
    }
  }

  // 2) Targeted SERP code queries
  const targetedQueries = [
    `${input.query} NAICS code`,
    `${input.query} UNSPSC`,
    `${input.query} SEC filing NAICS`,
    `${input.query} industry NAICS`,
    `${input.query} zoominfo NAICS`,
  ];
  for (const q of targetedQueries) {
    try {
      const res = await searchWebByQuery(q);
      for (const c of res.candidates.slice(0, 8)) {
        const text = `${c.title}. ${c.snippet}. ${c.url}`;
        const naics = uniq([...parseNaicsFromText(text), ...parseNaicsFromContext(text)]);
        const unspsc = parseUnspscFromText(text);
        if (naics.length) {
          naicsCandidates.push({
            codes: naics,
            sourceType: isAuthoritativeDomain(c.domain) ? "authoritative" : "serp_explicit",
            confidence: isAuthoritativeDomain(c.domain) ? 86 : 70,
            evidence: `SERP classification query matched: "${q}" (${c.domain ?? "unknown-domain"}).`,
          });
        }
        if (unspsc.length) {
          unspscCandidates.push({
            codes: unspsc,
            sourceType: isAuthoritativeDomain(c.domain) ? "authoritative" : "serp_explicit",
            confidence: isAuthoritativeDomain(c.domain) ? 86 : 70,
            evidence: `SERP classification query matched: "${q}" (${c.domain ?? "unknown-domain"}).`,
          });
        }
      }
    } catch {
      // Continue gracefully to unresolved
    }
  }

  let naicsBest = pickBestResolution(naicsCandidates);
  if (!naicsBest.codes.length) {
    const corpus = `${input.query}. ${input.candidates.map((c) => `${c.title}. ${c.snippet}`).join(" ")}. ${input.enrichments
      .map((e) => e.industryHint ?? "")
      .join(" ")}`;
    const inferred = inferNaicsFromIndustryText(corpus);
    if (inferred.length) {
      naicsBest = {
        codes: inferred,
        sourceType: "inferred",
        confidence: 38,
        evidence: [`Inferred from industry-language heuristic (${inferred.join(", ")}).`],
      };
    }
  }
  let unspscBest = pickBestResolution(unspscCandidates);
  if (!unspscBest.codes.length && naicsBest.codes.length) {
    const mappedUnspsc = mapNaicsToUnspsc(naicsBest.codes);
    if (mappedUnspsc.length) {
      unspscBest = {
        codes: mappedUnspsc,
        sourceType: "inferred",
        confidence: 46,
        evidence: [`Mapped from NAICS (${naicsBest.codes.join(", ")}).`],
      };
    }
  }

  return {
    naics: naicsBest,
    unspsc: unspscBest,
  };
}
