export type WebCompanyCandidate = {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
  source?: string;
  score?: number;
};
export type SearchProvider = "google_serpapi" | "duckduckgo";
export type SearchResult = {
  provider: SearchProvider;
  candidates: WebCompanyCandidate[];
  fallbackReason?: string;
  lowConfidence?: boolean;
};

function normalizeText(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const AGGREGATOR_DOMAIN_PATTERNS = [
  /(^|\.)linkedin\.com$/,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)crunchbase\.com$/,
  /(^|\.)glassdoor\.com$/,
  /(^|\.)zoominfo\.com$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)instagram\.com$/,
  /(^|\.)x\.com$/,
  /(^|\.)twitter\.com$/,
];

function isAggregatorDomain(domain?: string): boolean {
  if (!domain) return false;
  return AGGREGATOR_DOMAIN_PATTERNS.some((p) => p.test(domain.toLowerCase()));
}

export function scoreCandidate(query: string, candidate: WebCompanyCandidate): number {
  const q = normalizeText(query);
  const title = normalizeText(candidate.title);
  const domain = normalizeText(candidate.domain ?? "");
  let score = 0;
  if (title.includes(q)) score += 55;
  if (q.includes(title) && title.length > 4) score += 35;
  if (domain && q.split(" ").some((t) => t.length > 2 && domain.includes(t))) score += 20;
  if (/inc|ltd|llc|corp|company|solutions|technologies/i.test(candidate.title)) score += 10;
  if (domain && !isAggregatorDomain(candidate.domain)) score += 6;
  if (isAggregatorDomain(candidate.domain)) score -= 25;
  return Math.max(0, Math.min(100, score));
}

function withScores(query: string, candidates: WebCompanyCandidate[]): WebCompanyCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(query, c) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

type DuckTopic = {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DuckTopic[];
};

type DuckResponse = {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: DuckTopic[];
};

type SerpApiItem = {
  title?: string;
  snippet?: string;
  link?: string;
  source?: string;
};

type SerpApiResponse = {
  organic_results?: SerpApiItem[];
};

function flattenTopics(topics: DuckTopic[] = []): DuckTopic[] {
  const out: DuckTopic[] = [];
  for (const t of topics) {
    if (Array.isArray(t.Topics) && t.Topics.length) {
      out.push(...flattenTopics(t.Topics));
      continue;
    }
    out.push(t);
  }
  return out;
}

async function searchGoogleSerpApi(query: string): Promise<WebCompanyCandidate[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_MISSING_CONFIG");
  const q = `${query.trim()} company`;
  const url = `https://serpapi.com/search?${new URLSearchParams({
    engine: "google",
    q,
    api_key: key,
    num: "5",
  }).toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SERPAPI_HTTP_${res.status}`);
  }
  const payload = (await res.json()) as SerpApiResponse;
  const items = payload.organic_results ?? [];
  return items
    .filter((i) => i.title && i.link)
    .map((i) => ({
      title: i.title?.trim() || query,
      snippet: i.snippet?.trim() || "Web result available.",
      url: i.link?.trim() || "",
      domain: (() => {
        try {
          return i.link ? new URL(i.link).hostname : undefined;
        } catch {
          return undefined;
        }
      })(),
      source: i.source?.trim() || "serpapi",
    }));
}

async function searchDuckDuckGo(query: string): Promise<WebCompanyCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q + " company")}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as DuckResponse;

  const candidates: WebCompanyCandidate[] = [];
  if (payload.Heading || payload.AbstractText) {
    candidates.push({
      title: payload.Heading || q,
      snippet: payload.AbstractText || "Web result available.",
      url: payload.AbstractURL || "",
      domain: (() => {
        try {
          return payload.AbstractURL ? new URL(payload.AbstractURL).hostname : undefined;
        } catch {
          return undefined;
        }
      })(),
      source: "duckduckgo",
    });
  }

  const related = flattenTopics(payload.RelatedTopics).slice(0, 5);
  for (const item of related) {
    if (!item.Text) continue;
    const [title, ...rest] = item.Text.split(" - ");
    candidates.push({
      title: title?.trim() || q,
      snippet: rest.join(" - ").trim() || item.Text,
      url: item.FirstURL || "",
      domain: (() => {
        try {
          return item.FirstURL ? new URL(item.FirstURL).hostname : undefined;
        } catch {
          return undefined;
        }
      })(),
      source: "duckduckgo",
    });
  }

  const dedup = new Map<string, WebCompanyCandidate>();
  for (const c of candidates) {
    const key = `${c.title.toLowerCase()}::${c.url}`;
    if (!dedup.has(key)) dedup.set(key, c);
  }
  return [...dedup.values()];
}

export async function searchCompanyOnWeb(query: string): Promise<SearchResult> {
  try {
    const candidates = withScores(query, await searchGoogleSerpApi(query));
    const topScore = candidates[0]?.score ?? 0;
    const secondScore = candidates[1]?.score ?? 0;
    const ambiguousTop = Boolean(candidates[1]) && topScore - secondScore <= 10;
    if (candidates.length) {
      return {
        provider: "google_serpapi",
        candidates,
        lowConfidence: topScore < 55 || ambiguousTop,
      };
    }
    const duck = withScores(query, await searchDuckDuckGo(query));
    const topDuckScore = duck[0]?.score ?? 0;
    const secondDuckScore = duck[1]?.score ?? 0;
    const ambiguousDuckTop = Boolean(duck[1]) && topDuckScore - secondDuckScore <= 10;
    return {
      provider: "duckduckgo",
      candidates: duck,
      fallbackReason: "SERPAPI_EMPTY",
      lowConfidence: topDuckScore < 55 || ambiguousDuckTop,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? error.message : "SERPAPI_UNHANDLED_ERROR";
    const duck = withScores(query, await searchDuckDuckGo(query));
    const topDuckScore = duck[0]?.score ?? 0;
    const secondDuckScore = duck[1]?.score ?? 0;
    const ambiguousDuckTop = Boolean(duck[1]) && topDuckScore - secondDuckScore <= 10;
    return {
      provider: "duckduckgo",
      candidates: duck,
      fallbackReason: reason,
      lowConfidence: topDuckScore < 55 || ambiguousDuckTop,
    };
  }
}

export async function searchWebByQuery(query: string): Promise<SearchResult> {
  try {
    const google = withScores(query, await searchGoogleSerpApi(query));
    if (google.length) {
      return { provider: "google_serpapi", candidates: google };
    }
    const duck = withScores(query, await searchDuckDuckGo(query));
    return { provider: "duckduckgo", candidates: duck, fallbackReason: "SERPAPI_EMPTY" };
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? error.message : "SERPAPI_UNHANDLED_ERROR";
    const duck = withScores(query, await searchDuckDuckGo(query));
    return { provider: "duckduckgo", candidates: duck, fallbackReason: reason };
  }
}
