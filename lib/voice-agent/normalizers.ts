import { BUSINESS_DESIGNATIONS, EMPLOYEE_RANGES, MOCK_ASSESSORS, NAICS_CODES, REVENUE_RANGES, UNSPSC_CODES, VISA_TYPES } from "@/lib/constants";

/**
 * Normalize text for fuzzy matching:
 * - lowercase
 * - replace hyphens/dashes with spaces (so "Women-Led" matches "women led")
 * - strip everything except letters, digits, spaces
 * - collapse whitespace
 */
function clean(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[-–—]/g, " ")           // hyphens → spaces (fixes "women-led" vs "women led")
    .replace(/[^a-z0-9\s]/g, " ")     // strip special chars
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYesNo(input: string): boolean | null {
  const t = clean(input);
  if (!t) return null;
  if (/\b(not sure|don t know|dont know|maybe|depends)\b/.test(t)) return null;

  const yesPatterns = [
    /\b(yes|yeah|yup|yep|haan|ha|sure|correct|affirmative|absolutely|definitely|of course|right)\b/,
    /\byes it is\b/,
    /\bit is yes\b/,
    /\b(continue|go ahead|move on|next)\b/,
  ];
  const noPatterns = [
    /\b(no|nope|nah|nahi|negative)\b/,
    /\bnot really\b/,
    /\bnot at all\b/,
    /\bis not\b/,
    /\bisn t\b/,
    /\bno it is\b/,
    /\bnone\b/,
  ];

  const yesHit = yesPatterns.some((pattern) => pattern.test(t));
  const noHit = noPatterns.some((pattern) => pattern.test(t));
  if (yesHit && noHit) return null;
  if (yesHit) return true;
  if (noHit) return false;
  return null;
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function stripLeadingPhrases(input: string, phrases: string[]): string {
  let value = input.trim();
  for (const phrase of phrases) {
    const pattern = new RegExp(`^${phrase}\\s+`, "i");
    value = value.replace(pattern, "").trim();
  }
  return value;
}

function cleanupEntityValue(raw: string): string {
  return raw
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^[\s,.:-]+|[\s,.:-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBusinessName(input: string): string {
  const stripped = stripLeadingPhrases(input, [
    "it\\s*'?s\\s*called",
    "it\\s+is\\s+called",
    "called",
    "my\\s+registered\\s+business\\s+name\\s+is",
    "my\\s+business\\s+name\\s+is",
    "the\\s+registered\\s+business\\s+name\\s+is",
    "registered\\s+business\\s+name\\s+is",
    "business\\s+name\\s+is",
    "my\\s+business\\s+is",
    "our\\s+business\\s+is",
    "the\\s+business\\s+is",
    "the\\s+name\\s+is",
    "name\\s+is",
    "we\\s+are",
    "we\\s*'?re",
    "it\\s+is",
    "it\\s*'?s",
  ]);
  const cleaned = cleanupEntityValue(stripped);
  return toTitleCase(cleaned || input.trim());
}

export function normalizeOwnerName(input: string): string {
  let text = input
    .replace(/\b(?:gender|ownership|holds|owns|percent|percentage|%|male|female|man|woman|non\s*binary).*$/i, "")
    .replace(/\bowner\s*(one|1|two|2|three|3)\b/ig, " ")
    .replace(/\b(owner|the owner|my owner)\b/ig, " ");
  
  const stripped = stripLeadingPhrases(text, [
    "owner\\s*(?:one|1|two|2|three|3)\\s+is",
    "owner\\s+is",
    "the\\s+owner\\s+is",
    "my\\s+owner\\s+is",
    "owner",
    "the\\s+full\\s+name\\s+is",
    "owner\\s+full\\s+name\\s+is",
    "my\\s+name\\s+is",
    "full\\s+name\\s+is",
    "his\\s+name\\s+is",
    "her\\s+name\\s+is",
    "their\\s+name\\s+is",
    "owner'?s\\s+name\\s+is",
    "owner\\s+name\\s+is",
    "the\\s+name\\s+is",
    "name\\s+is",
    "this\\s+is",
    "i\\s+am",
    "i\\s*'?m",
    "he\\s+is",
    "she\\s+is",
    "they\\s+are",
  ]);
  
  let cleaned = cleanupEntityValue(stripped);
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned
      .replace(/\b(?:and\s+(?:she'?s|he'?s|they'?re|their|her|his|the|a|an)|and)\s*$/ig, "")
      .replace(/\s+(?:the|is|are|a|an|ownership|holds|she'?s|he'?s|they'?re|her|his|their|owner|one|two|three|percent)\s*$/ig, "")
      .replace(/^(?:is|are)\s+/ig, "")
      .replace(/^(?:and|also)\s+|\s+(?:and|also)$/ig, "")
      .replace(/\b(?:and\s+he|and\s+she|and\s+they)\b/ig, " ")
      .replace(/^,+|,+$/g, "")
      .replace(/[.]+$/g, "")
      .replace(/[%|]/g, " ")
      .trim();
  } while (cleaned !== prev);
  return toTitleCase(cleaned || text.trim() || input.trim());
}

export function isLikelyOwnerName(input: string): boolean {
  const normalized = input
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return false;
  const low = normalized.toLowerCase();
  if (/\b(owner|ownership|percent|male|female|gender|he|she|they|one|two|three)\b/.test(low)) return false;
  if (/[%|0-9]/.test(normalized)) return false;
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((p) => /^[a-z][a-z'.-]*$/i.test(p));
}

export function normalizeCountry(input: string): string {
  // Strip common leading phrases like "It's based in", "We are from", etc.
  const stripped = stripLeadingPhrases(input, [
    "it\\s*'?s\\s+based\\s+in",
    "it\\s+is\\s+based\\s+in",
    "we\\s+are\\s+based\\s+in",
    "we\\s*'?re\\s+based\\s+in",
    "based\\s+in",
    "we\\s+are\\s+from",
    "we\\s*'?re\\s+from",
    "i\\s+am\\s+from",
    "i\\s*'?m\\s+from",
    "from",
    "it\\s*'?s",
    "it\\s+is",
  ]);
  const cleaned = cleanupEntityValue(stripped);
  const value = cleaned || input.trim();
  const t = clean(value);
  if (["us", "usa", "u s", "u s a", "united states", "united states of america", "america"].includes(t)) {
    return "United States";
  }
  return toTitleCase(value);
}

export function isUSCountry(value: string): boolean {
  const t = clean(value);
  return t === "us" || t === "usa" || t === "united states" || t === "united states of america";
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function wordMatchScore(inputWords: string[], targetWord: string) {
  let maxScore = 0;
  for (const iw of inputWords) {
    if (iw === targetWord) return 1;
    const dist = levenshtein(iw, targetWord);
    const score = 1 - dist / Math.max(iw.length, targetWord.length);
    if (score > maxScore) maxScore = score;
  }
  return maxScore;
}

const STOP_WORDS = new Set([
  "and", "the", "a", "an", "for", "of", "in", "on", "at", "to", "with", "from",
  "we", "our", "business", "company", "services", "service", "products", "product",
  "provide", "offering", "offer", "sell", "build", "run", "do",
]);

export interface CodeMatchCandidate {
  code: string;
  label: string;
  score: number;
}

const NAICS_ALIASES: Record<string, string[]> = {
  "11": ["agriculture", "farming", "farm", "forestry", "fishing", "hunting", "crops", "livestock"],
  "21": ["mining", "quarry", "oil", "gas", "extraction", "drilling"],
  "22": ["utilities", "electricity", "power", "water utility", "energy distribution"],
  "23": ["construction", "contractor", "civil work", "building contractor"],
  "31-33": ["manufacturing", "factory", "assembly", "production", "made goods", "fabrication"],
  "42": ["wholesale", "bulk supply", "distributor", "distribution"],
  "44-45": ["retail", "store", "shop", "ecommerce", "online store", "consumer sales"],
  "48-49": ["transportation", "logistics", "warehousing", "freight", "shipping", "delivery", "courier"],
  "51": ["information", "media", "software publishing", "telecom", "data services"],
  "52": ["finance", "financial", "insurance", "banking", "fintech"],
  "53": ["real estate", "property management", "rental", "leasing"],
  "54": ["consulting", "professional services", "technical services", "legal", "accounting", "it services", "engineering"],
  "55": ["holding company", "corporate management", "enterprise management"],
  "56": ["admin support", "outsourcing", "back office", "staffing", "facilities support"],
  "61": ["education", "training", "learning", "edtech", "coaching"],
  "62": ["healthcare", "medical", "clinic", "hospital", "social assistance", "wellness"],
  "71": ["arts", "entertainment", "recreation", "events", "gaming"],
  "72": ["hospitality", "accommodation", "food service", "restaurant", "hotel", "catering"],
  "81": ["repair", "maintenance", "personal services", "laundry", "salon"],
};

const UNSPSC_ALIASES: Record<string, string[]> = {
  "23000000": ["industrial machinery", "equipment"],
  "25000000": ["vehicles", "transport equipment", "fleet"],
  "30000000": ["building materials", "construction materials"],
  "42000000": ["medical equipment", "medical accessories"],
  "43000000": ["it", "software", "technology", "information technology", "cybersecurity"],
  "44000000": ["office supplies", "office equipment", "stationery"],
  "47000000": ["cleaning supplies", "janitorial", "sanitation"],
  "50000000": ["food", "beverage", "grocery"],
  "56000000": ["furniture", "furnishings"],
  "70000000": ["farming", "fishing"],
  "72000000": ["construction services", "building services"],
  "76000000": ["industrial cleaning", "facility cleaning"],
  "77000000": ["environmental services", "waste management"],
  "78000000": ["transportation services", "storage services", "logistics services", "warehousing services"],
  "80000000": ["management consulting", "business consulting", "professional services"],
  "81000000": ["engineering services", "research services", "r&d"],
  "82000000": ["design services", "editorial services", "creative services"],
  "84000000": ["financial services", "insurance services"],
  "85000000": ["healthcare services", "medical services", "clinical services"],
  "86000000": ["education services", "training services"],
  "90000000": ["travel services", "food services", "hospitality services"],
};

function normalizedTokens(input: string): string[] {
  return clean(input)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function explicitCodeHits(
  input: string,
  options: Array<{ code: string; label: string }>,
): string[] {
  const t = clean(input);
  const explicitCodes: string[] = t.match(/\b\d{2}(?:\s*\d{2})?\b|\b\d{8}\b/g) ?? [];
  return options
    .filter((opt) => explicitCodes.includes(clean(opt.code)))
    .map((opt) => opt.code);
}

function scoreCodeCandidates(
  input: string,
  options: Array<{ code: string; label: string }>,
  aliasesByCode: Record<string, string[]> = {},
): CodeMatchCandidate[] {
  const t = clean(input);
  const inputWords = t.split(/\s+/);
  const tokenSet = new Set(normalizedTokens(input));
  const directCodes = new Set(explicitCodeHits(input, options));
  const results: CodeMatchCandidate[] = [];

  for (const opt of options) {
    const label = clean(opt.label);
    const labelTokens = normalizedTokens(opt.label);
    const aliases = aliasesByCode[opt.code] ?? [];

    let score = 0;
    if (directCodes.has(opt.code)) score = 1;

    if (t.includes(label)) score = Math.max(score, 0.94);

    if (labelTokens.length > 0) {
      const overlap = labelTokens.filter((w) => tokenSet.has(w)).length;
      const overlapScore = overlap / labelTokens.length;
      score = Math.max(score, overlapScore * 0.8);

      let fuzzyTotal = 0;
      for (const lw of labelTokens) {
        fuzzyTotal += wordMatchScore(inputWords, lw);
      }
      const fuzzyScore = fuzzyTotal / labelTokens.length;
      score = Math.max(score, fuzzyScore * 0.75);
    }

    if (aliases.length > 0) {
      let bestAliasScore = 0;
      let bestAliasTokenCount = 0;
      for (const alias of aliases) {
        const aliasTokens = normalizedTokens(alias);
        if (aliasTokens.length === 0) continue;
        const aliasHits = aliasTokens.filter((w) => tokenSet.has(w)).length;
        const aliasScore = aliasHits / aliasTokens.length;
        if (aliasScore > bestAliasScore) {
          bestAliasScore = aliasScore;
          bestAliasTokenCount = aliasTokens.length;
        }
      }
      const aliasWeight = bestAliasTokenCount <= 1 ? 0.74 : 0.96;
      score = Math.max(score, bestAliasScore * aliasWeight);
    }

    if (score >= 0.2) {
      results.push({ code: opt.code, label: opt.label, score: Number(score.toFixed(3)) });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function suggestNaicsMatches(input: string): CodeMatchCandidate[] {
  return scoreCodeCandidates(input, NAICS_CODES, NAICS_ALIASES).slice(0, 3);
}

export function suggestUnspscMatches(input: string): CodeMatchCandidate[] {
  return scoreCodeCandidates(input, UNSPSC_CODES, UNSPSC_ALIASES).slice(0, 3);
}

export function parseNaicsCodes(input: string): string[] {
  const ranked = suggestNaicsMatches(input);
  return ranked.filter((r) => r.score >= 0.6).map((r) => r.code);
}

export function parseUnspscCodes(input: string): string[] {
  const ranked = suggestUnspscMatches(input);
  return ranked.filter((r) => r.score >= 0.6).map((r) => r.code);
}

/**
 * Fuzzy-match designations.
 * Handles spoken variants: "women led" matches "Women-Led Business",
 * "minority owned" matches "Minority-Owned Business", etc.
 */
export function parseDesignations(input: string): string[] {
  const t = clean(input);

  // direct matching against cleaned constants (hyphens already → spaces)
  const hits = BUSINESS_DESIGNATIONS.filter((d) => {
    const c = clean(d);
    // full match
    if (t.includes(c)) return true;
    // word-piece match: all significant words present
    if (c.split(" ").every((piece) => piece.length > 2 && t.includes(piece))) return true;
    return false;
  });

  // keyword fallback for common spoken phrases
  if (hits.length === 0) {
    const aliases: Array<{ pattern: RegExp; designation: string }> = [
      { pattern: /\b(small\s*business)\b/, designation: "Small Business" },
      { pattern: /\b(wom[ae]n\s*led)\b/, designation: "Women-Led Business" },
      { pattern: /\b(wom[ae]n\s*managed)\b/, designation: "Women-Managed Business" },
      { pattern: /\b(minority\s*owned)\b/, designation: "Minority-Owned Business" },
      { pattern: /\b(lgbtq|lgbt)\b/, designation: "LGBTQ+-Owned Business" },
      { pattern: /\b(veteran\s*owned)\b/, designation: "Veteran-Owned Business" },
      { pattern: /\b(disability\s*owned|disabled\s*owned)\b/, designation: "Disability-Owned Business" },
    ];

    for (const alias of aliases) {
      if (alias.pattern.test(t)) {
        hits.push(alias.designation);
      }
    }
  }

  return Array.from(new Set(hits));
}

export function parseVisaType(input: string): string | null {
  const t = clean(input);
  for (const visa of VISA_TYPES) {
    if (t.includes(clean(visa))) return visa;
  }
  if (t.includes("other")) return "Other";
  return null;
}

/**
 * Parse gender with common STT mishearings.
 * "mail" → male, "femail" → female, etc.
 */
export function parseGender(input: string): "female" | "male" | "non_binary" | "other" | null {
  const t = clean(input);
  if (t.includes("female") || t.includes("femail") || t === "woman" || t === "women") return "female";
  if (t.includes("non binary") || t.includes("nonbinary") || t.includes("non-binary")) return "non_binary";
  // check male AFTER female/non_binary to avoid "female" matching "male"
  if (t.includes("male") || t === "mail" || t === "man" || t === "men" || /\b(i am|i m|i'm)\s*(a\s+)?mal/.test(t) || /\bsaying\s+mal/.test(t)) return "male";
  if (t.includes("other")) return "other";
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};

export function parsePercent(input: string): number | null {
  const t = clean(input);
  const match = t.match(/\d{1,3}(?:\.\d+)?/);
  if (match) {
    const value = Number(match[0]);
    if (!Number.isNaN(value) && value > 0 && value <= 100) return value;
  }

  const words = t.split(/\s+/);
  let accumulated = 0;
  let current = 0;
  let foundNumber = false;

  for (const word of words) {
    if (NUMBER_WORDS[word] !== undefined) {
      foundNumber = true;
      const num = NUMBER_WORDS[word];
      if (num === 100) {
        if (current === 0) current = 1;
        current *= 100;
        accumulated += current;
        current = 0;
      } else {
        current += num;
      }
    }
  }

  const finalVal = accumulated + current;
  if (foundNumber && finalVal > 0 && finalVal <= 100) return finalVal;
  return null;
}

export function parseOwnerDetails(input: string): { name: string; gender: "female" | "male" | "non_binary" | "other" | null; percent: number | null } {
  const gender = parseGender(input);
  const percent = parsePercent(input);
  
  let remainder = input
    .replace(/\b(?:and\s+)?(?:her|his|their)?\s*(?:gender|sex)\s*(?:is|:)?\s*(?:female|male|non[\s-]*binary|other|mail|femail|man|woman|men|women)\b/ig, " ")
    .replace(/\b(?:ownership|ownership\s+percentage)\s*(?:is|:)?\s*\d{1,3}(?:\.\d+)?\s*%?\b/ig, " ")
    .replace(/\b(?:ownership|holds?|owns?)\b[^,.!?]*(?:percent|percentage|%)\b/ig, " ");
  
  if (gender) {
    const gword = gender === "non_binary" ? "non binary" : gender;
    remainder = remainder.replace(new RegExp(`\\b${gword}\\b`, "ig"), "");
    remainder = remainder.replace(/\b(mail|femail|man|woman|men|women|male|female)\b/ig, "");
  }
  
  if (percent !== null) {
    remainder = remainder.replace(new RegExp(`\\b${percent}\\b`, "ig"), "");
    Object.keys(NUMBER_WORDS).forEach(w => {
      remainder = remainder.replace(new RegExp(`\\b${w}\\b`, "ig"), "");
    });
    remainder = remainder.replace(/\b(percent|percentage|%)\b/ig, "");
  }

  const name = normalizeOwnerName(remainder.trim());
  return { name, gender, percent };
}

/**
 * Parse employee range with natural speech variants.
 * "1000 plus" → "1000+", "one to ten" → "1-10", "eleven to fifty" → "11-50", etc.
 */
export function parseEmployeeRange(input: string): string | null {
  const t = clean(input);

  const toNumber = (raw: string): number => Number(raw.replace(/,/g, ""));
  const mapCountToRange = (count: number): string => {
    if (count <= 10) return "1-10";
    if (count <= 50) return "11-50";
    if (count <= 200) return "51-200";
    if (count <= 500) return "201-500";
    if (count <= 1000) return "501-1000";
    return "1000+";
  };

  // Interval first (e.g., "between 500 and 1000", "500 to 1000")
  const interval = t.match(/\b(?:between\s+)?(\d{1,4}(?:,\d{3})?)\s*(?:to|and|-)\s*(\d{1,4}(?:,\d{3})?)\b/);
  if (interval) {
    const a = toNumber(interval[1]);
    const b = toNumber(interval[2]);
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const midpoint = Math.round((low + high) / 2);
    return mapCountToRange(midpoint);
  }

  // Approximate single value (e.g., "around 900", "about 300")
  const approx = t.match(/\b(?:around|about|roughly|approximately|near)\s+(\d{1,4}(?:,\d{3})?)\b/);
  if (approx) return mapCountToRange(toNumber(approx[1]));

  // Comparatives
  const moreThan = t.match(/\b(?:more\s+than|over|above)\s+(\d{1,4}(?:,\d{3})?)\b/);
  if (moreThan) {
    const n = toNumber(moreThan[1]);
    return n >= 1000 ? "1000+" : mapCountToRange(n + 1);
  }
  const lessThan = t.match(/\b(?:less\s+than|under|below)\s+(\d{1,4}(?:,\d{3})?)\b/);
  if (lessThan) {
    const n = Math.max(1, toNumber(lessThan[1]) - 1);
    return mapCountToRange(n);
  }

  const single = t.match(/\b(\d{1,4}(?:,\d{3})?)\b/);
  if (single) return mapCountToRange(toNumber(single[1]));

  // direct match first
  const direct = EMPLOYEE_RANGES.find((r) => t.includes(clean(r)));
  if (direct) return direct;

  // handle spoken variants
  const spokenMap: Array<{ patterns: RegExp[]; range: string }> = [
    { patterns: [/\b1\s*(to|two)\s*10\b/, /\bone\s+(to|two)\s+ten\b/, /\b1\s*-\s*10\b/], range: "1-10" },
    { patterns: [/\b11\s*to\s*50\b/, /\beleven\s+to\s+fifty\b/, /\b11\s*-\s*50\b/], range: "11-50" },
    { patterns: [/\b51\s*to\s*200\b/, /\bfifty\s*one\s+to\s+two\s+hundred\b/, /\b51\s*-\s*200\b/], range: "51-200" },
    { patterns: [/\b201\s*to\s*500\b/, /\btwo\s+hundred\s*(and\s+)?one\s+to\s+five\s+hundred\b/], range: "201-500" },
    { patterns: [/\b501\s*to\s*1000\b/, /\bfive\s+hundred\s*(and\s+)?one\s+to\s+(one\s+)?thousand\b/], range: "501-1000" },
    { patterns: [/\b1000\s*plus\b/, /\b1000\s*\+/, /\bthousand\s*plus\b/, /\bmore\s+than\s+(a\s+)?thousand\b/, /\bover\s+(a\s+)?thousand\b/, /\babove\s+1000\b/], range: "1000+" },
  ];

  for (const entry of spokenMap) {
    for (const pattern of entry.patterns) {
      if (pattern.test(t)) return entry.range;
    }
  }

  return null;
}

/**
 * Parse revenue range with spoken variants.
 * Handles "$", "dollars", "k", "million" etc.
 */
export function parseRevenueRange(input: string): string | null {
  const t = clean(input);
  const amountPatterns = /(\d+(?:\.\d+)?)\s*(k|m|mn|mil|million|thousand|lakh|lakhs|crore|crores)?/g;
  const amounts: number[] = [];

  const unitToMultiplier = (unit: string | undefined): number => {
    switch ((unit ?? "").toLowerCase()) {
      case "k": return 1_000;
      case "thousand": return 1_000;
      case "m":
      case "mn":
      case "mil":
      case "million": return 1_000_000;
      case "lakh":
      case "lakhs": return 100_000;
      case "crore":
      case "crores": return 10_000_000;
      default: return 1;
    }
  };

  for (const m of Array.from(t.matchAll(amountPatterns))) {
    const raw = Number(m[1]);
    if (Number.isNaN(raw)) continue;
    const value = raw * unitToMultiplier(m[2]);
    if (value > 0) amounts.push(value);
  }

  const mapAmountToRange = (amount: number): string => {
    if (amount < 100_000) return "Under $100K";
    if (amount < 500_000) return "$100K–$500K";
    if (amount < 1_000_000) return "$500K–$1M";
    if (amount < 5_000_000) return "$1M–$5M";
    if (amount < 25_000_000) return "$5M–$25M";
    return "$25M+";
  };

  // Interval first for natural phrasing like "5 to 25 million"
  const interval = t.match(/\b(?:between\s+)?(\d+(?:\.\d+)?)\s*(k|m|mn|mil|million|thousand|lakh|lakhs|crore|crores)?\s*(?:to|and|-)\s*(\d+(?:\.\d+)?)\s*(k|m|mn|mil|million|thousand|lakh|lakhs|crore|crores)?\b/);
  if (interval) {
    const left = Number(interval[1]) * unitToMultiplier(interval[2]);
    const right = Number(interval[3]) * unitToMultiplier(interval[4] || interval[2]);
    if (!Number.isNaN(left) && !Number.isNaN(right)) {
      const low = Math.min(left, right);
      const high = Math.max(left, right);
      if (low === 25_000_000 && high === 25_000_000) return "$25M+";
      const midpoint = (low + high) / 2;
      return mapAmountToRange(midpoint);
    }
  }

  if (amounts.length > 0) {
    // Exact 25M follows inclusive threshold rule -> $25M+
    const primary = amounts[0];
    if (primary === 25_000_000) return "$25M+";
    return mapAmountToRange(primary);
  }

  // direct match
  const direct = REVENUE_RANGES.find((r) => t.includes(clean(r)));
  if (direct) return direct;

  // spoken variants
  const spokenMap: Array<{ patterns: RegExp[]; range: string }> = [
    { patterns: [/\bunder\s+(a\s+)?hundred\s*(k|thousand)\b/, /\bless\s+than\s+(a\s+)?hundred\s*(k|thousand)\b/, /\bbelow\s+100\s*k\b/], range: "Under $100K" },
    { patterns: [/\b100\s*k?\s*(to|through)\s*500\s*k\b/, /\bhundred\s*(k|thousand)\s*(to|through)\s*five\s+hundred\s*(k|thousand)\b/], range: "$100K–$500K" },
    { patterns: [/\b500\s*k?\s*(to|through)\s*1\s*m\b/, /\bfive\s+hundred\s*(k|thousand)\s*(to|through)\s*(one\s+)?million\b/, /\bhalf\s+a?\s*million\s*(to|through)\s*(one\s+)?million\b/], range: "$500K–$1M" },
    { patterns: [/\b1\s*m?\s*(to|through)\s*5\s*m\b/, /\b(one\s+)?million\s*(to|through)\s*five\s+million\b/], range: "$1M–$5M" },
    { patterns: [/\b5\s*m?\s*(to|through)\s*25\s*m\b/, /\bfive\s+million\s*(to|through)\s*twenty\s*five\s+million\b/], range: "$5M–$25M" },
    { patterns: [/\b25\s*m?\s*plus\b/, /\bover\s+25\s*m\b/, /\babove\s+25\s*m\b/, /\bmore\s+than\s+25\s*million\b/, /\btwenty\s*five\s+million\s+plus\b/], range: "$25M+" },
  ];

  for (const entry of spokenMap) {
    for (const pattern of entry.patterns) {
      if (pattern.test(t)) return entry.range;
    }
  }

  return null;
}

export function parseCertType(input: string): "self" | "digital" | null {
  const t = clean(input);
  if (t.includes("digital")) return "digital";
  if (t.includes("self")) return "self";
  return null;
}

export function parseAssessorId(input: string): string | null {
  const t = clean(input);
  if (t.includes("skip") || t.includes("none") || t.includes("no assessor")) return "";
  const inputWords = t.split(/\s+/);
  const match = MOCK_ASSESSORS.find((a) => {
    const [baseName] = a.name.split(",");
    const cleanedBaseName = clean(baseName);
    if (t.includes(cleanedBaseName)) return true;
    const nameParts = cleanedBaseName.split(" ").filter(Boolean);
    return nameParts.every((part) => {
      if (part.length <= 2) return true;
      return t.includes(part) || wordMatchScore(inputWords, part) >= 0.7;
    });
  });
  return match?.id ?? null;
}
