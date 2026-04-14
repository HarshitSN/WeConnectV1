import type { RegistryCompany } from "./types";
import type { EnrichmentSummary } from "./enrichment";
import type { CodeClassification } from "./code-classification";

export type FieldSource = "registry" | "web" | "manual";

export type RegistrationOwner = {
  fullName: string;
  gender: string;
  ownershipPct: number;
};

export type RegistrationDraft = {
  business_name: string;
  women_owned: boolean | null;
  country: string;
  us_citizen: boolean | null;
  visa_type: string;
  webank_certified: boolean | null;
  naics_codes: string[];
  unspsc_codes: string[];
  designations: string[];
  owner_details: RegistrationOwner[];
  num_employees: string;
  revenue_range: string;
  additional_certs: string[];
  business_description: string;
  cert_type: string;
  assessor: string;
};

export type DiscoverPrefillResponse = {
  prefill: RegistrationDraft;
  fieldConfidence: Partial<Record<keyof RegistrationDraft, number>>;
  fieldSource: Partial<Record<keyof RegistrationDraft, FieldSource>>;
  evidence: Partial<Record<keyof RegistrationDraft, string>>;
  missingRequired: string[];
  countryResolution: {
    source: "explicit" | "inferred" | "unresolved";
    reason: string;
  };
};

export const REQUIRED_FIELDS: Array<keyof RegistrationDraft> = [
  "business_name",
  "country",
  "naics_codes",
  "unspsc_codes",
  "owner_details",
  "business_description",
  "cert_type",
];

export function emptyRegistrationDraft(): RegistrationDraft {
  return {
    business_name: "",
    women_owned: null,
    country: "",
    us_citizen: null,
    visa_type: "",
    webank_certified: null,
    naics_codes: [],
    unspsc_codes: [],
    designations: [],
    owner_details: [],
    num_employees: "",
    revenue_range: "",
    additional_certs: [],
    business_description: "",
    cert_type: "",
    assessor: "",
  };
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function toNumeric(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOwners(value: unknown): RegistrationOwner[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const candidate = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      fullName: toCleanString(candidate.fullName),
      gender: toCleanString(candidate.gender),
      ownershipPct: toNumeric(candidate.ownershipPct),
    };
  });
}

export function normalizeRegistrationDraft(input: unknown): RegistrationDraft {
  const candidate = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    business_name: toCleanString(candidate.business_name),
    women_owned: toOptionalBoolean(candidate.women_owned),
    country: toCleanString(candidate.country),
    us_citizen: toOptionalBoolean(candidate.us_citizen),
    visa_type: toCleanString(candidate.visa_type),
    webank_certified: toOptionalBoolean(candidate.webank_certified),
    naics_codes: normalizeStringList(candidate.naics_codes),
    unspsc_codes: normalizeStringList(candidate.unspsc_codes),
    designations: normalizeStringList(candidate.designations),
    owner_details: normalizeOwners(candidate.owner_details),
    num_employees: toCleanString(candidate.num_employees),
    revenue_range: toCleanString(candidate.revenue_range),
    additional_certs: normalizeStringList(candidate.additional_certs),
    business_description: toCleanString(candidate.business_description),
    cert_type: toCleanString(candidate.cert_type),
    assessor: toCleanString(candidate.assessor),
  };
}

function inferCountry(jurisdiction: string): string {
  const j = jurisdiction.toLowerCase();
  if (j.includes("web search result") || j.includes("web source")) return "";
  if (j.includes("united states") || j.includes("usa") || j.includes("us")) return "United States";
  if (j.includes("uk")) return "United Kingdom";
  if (j.includes("brazil")) return "Brazil";
  if (j.includes("saudi")) return "Saudi Arabia";
  return jurisdiction.split("—")[0]?.trim() ?? "";
}

function inferCountryFromWebsiteUrl(websiteUrl: string): string {
  try {
    const host = new URL(websiteUrl).hostname.toLowerCase();
    if (host.endsWith(".gov") || host.endsWith(".us")) return "United States";
    if (host.endsWith(".uk")) return "United Kingdom";
    if (host.endsWith(".in")) return "India";
    if (host.endsWith(".ca")) return "Canada";
    if (host.endsWith(".br")) return "Brazil";
    if (host.endsWith(".ae")) return "UAE";
    if (host.endsWith(".sg")) return "Singapore";
    if (host.endsWith(".au")) return "Australia";
  } catch {
    return "";
  }
  return "";
}

function inferCountryFromWebSignals(
  company: RegistryCompany,
  classification?: CodeClassification,
): { country: string; reason: string } | null {
  const fromDomain = inferCountryFromWebsiteUrl(company.websiteUrl);
  if (fromDomain) {
    return {
      country: fromDomain,
      reason: `Inferred from trusted domain/TLD signal (${company.websiteUrl}).`,
    };
  }
  const naicsSourceType = classification?.naics.sourceType;
  if (
    classification?.naics.codes.length &&
    (naicsSourceType === "authoritative" || naicsSourceType === "serp_explicit")
  ) {
    return {
      country: "United States",
      reason: `Inferred from U.S.-oriented NAICS signal (${classification.naics.codes.join(", ")}).`,
    };
  }
  return null;
}

export function mapCompanyToPrefill(
  company: RegistryCompany,
  source: FieldSource = "registry",
  enrichment?: EnrichmentSummary,
  classification?: CodeClassification,
): DiscoverPrefillResponse {
  const jurisdictionCountry = inferCountry(company.jurisdiction);
  const explicitEnrichmentCountry =
    enrichment?.country && enrichment.countrySource === "explicit_phrase" ? enrichment.country : "";
  const inferredEnrichmentCountry =
    enrichment?.country && enrichment.countrySource !== "explicit_phrase" ? enrichment.country : "";
  const webSignalCountry = source === "web" ? inferCountryFromWebSignals(company, classification) : null;
  const inferredCountry =
    explicitEnrichmentCountry ||
    inferredEnrichmentCountry ||
    (source === "web" ? webSignalCountry?.country ?? "" : jurisdictionCountry);
  const countryResolution: DiscoverPrefillResponse["countryResolution"] = explicitEnrichmentCountry
    ? { source: "explicit", reason: "Explicit country phrase found in fetched web content." }
    : inferredEnrichmentCountry
      ? {
          source: "inferred",
          reason:
            enrichment?.countrySource === "signal_domain_tld"
              ? "Country inferred from trusted domain/TLD signal."
              : "Country inferred from strong regional text/address signals.",
        }
      : webSignalCountry
        ? { source: "inferred", reason: webSignalCountry.reason }
        : jurisdictionCountry
          ? { source: "inferred", reason: `Inferred from jurisdiction text: ${company.jurisdiction}` }
          : { source: "unresolved", reason: "Country could not be confidently inferred from available signals." };
  const ownerName = enrichment?.ownerName || company.primaryOwner;
  const industryText = enrichment?.industryHint || company.registrySnippet;
  const naicsCodes =
    classification?.naics.codes.length
      ? classification.naics.codes
      : enrichment?.naicsCodes?.length
        ? enrichment.naicsCodes
        : [];
  const unspscCodes =
    classification?.unspsc.codes.length
      ? classification.unspsc.codes
      : enrichment?.unspscCodes?.length
        ? enrichment.unspscCodes
        : [];
  const prefill: RegistrationDraft = {
    ...emptyRegistrationDraft(),
    business_name: enrichment?.legalName || company.companyName,
    women_owned: source === "registry" ? company.ownershipFemalePct >= 51 : null,
    country: inferredCountry,
    naics_codes: naicsCodes,
    unspsc_codes: unspscCodes,
    designations: source === "registry" && company.ownershipFemalePct >= 51 ? ["Women-Led"] : [],
    owner_details:
      source === "registry"
        ? [
            {
              fullName: ownerName,
              gender: "Female",
              ownershipPct: company.ownershipFemalePct,
            },
          ]
        : [
            {
              fullName: ownerName || "Unknown owner (confirm via voice)",
              gender: "Unknown",
              ownershipPct: 100,
            },
          ],
    num_employees: enrichment?.employeeHint ?? "",
    revenue_range: enrichment?.revenueHint ?? "",
    business_description: `Registered entity: ${enrichment?.legalName || company.companyName}. ${industryText}.`,
  };

  const fieldConfidence: Partial<Record<keyof RegistrationDraft, number>> = {
    business_name: 98,
    women_owned: source === "registry" ? 90 : 35,
    country:
      source === "registry"
        ? 84
        : countryResolution.source === "explicit"
          ? 62
          : countryResolution.source === "inferred"
            ? 46
            : 0,
    naics_codes:
      typeof classification?.naics.confidence === "number"
        ? classification.naics.confidence
        : enrichment?.naicsCodes?.length
          ? 74
          : naicsCodes.length
            ? 56
            : 0,
    unspsc_codes:
      typeof classification?.unspsc.confidence === "number"
        ? classification.unspsc.confidence
        : enrichment?.unspscCodes?.length
          ? 74
          : unspscCodes.length
            ? 56
            : 0,
    designations: source === "registry" ? 62 : 40,
    owner_details: source === "registry" ? 86 : 30,
    business_description: source === "registry" ? 72 : 58,
  };

  const fieldSource: Partial<Record<keyof RegistrationDraft, FieldSource>> = {
    business_name: source,
    women_owned: source,
    country: source,
    naics_codes: naicsCodes.length ? "web" : "manual",
    unspsc_codes: unspscCodes.length ? "web" : "manual",
    designations: source,
    owner_details: source,
    business_description: source,
  };
  const evidence: Partial<Record<keyof RegistrationDraft, string>> = {
    business_name: enrichment?.legalName
      ? `From SERP candidate title: ${enrichment.legalName}`
      : "From matched company record.",
    country: enrichment?.country
      ? countryResolution.source === "explicit"
        ? `Country inferred from explicit web company-location phrase: ${enrichment.country}`
        : countryResolution.reason
      : inferredCountry
        ? countryResolution.reason
        : "Country could not be confidently inferred from web source.",
    owner_details: enrichment?.ownerName
      ? `Owner/founder name hint extracted: ${enrichment.ownerName}`
      : "Owner from available company record.",
    naics_codes: classification
      ? `Classification (${classification.naics.sourceType}, ${classification.naics.confidence}%): ${classification.naics.evidence.join(" ")}`
      : enrichment?.naicsCodes?.length
        ? `Detected NAICS from web content: ${enrichment.naicsCodes.join(", ")}`
        : "Could not infer NAICS from available web sources.",
    unspsc_codes: classification
      ? `Classification (${classification.unspsc.sourceType}, ${classification.unspsc.confidence}%): ${classification.unspsc.evidence.join(" ")}`
      : enrichment?.unspscCodes?.length
        ? `Detected UNSPSC from web content: ${enrichment.unspscCodes.join(", ")}`
        : "Could not infer UNSPSC from available web sources.",
    business_description: enrichment?.industryHint
      ? "Generated from extracted industry/company description."
      : "Generated from registry/web snippet.",
    num_employees: enrichment?.employeeHint ? `Detected employee signal: ${enrichment.employeeHint}` : "",
    revenue_range: enrichment?.revenueHint ? `Detected revenue signal: ${enrichment.revenueHint}` : "",
  };

  return {
    fieldConfidence,
    prefill,
    fieldSource,
    evidence,
    missingRequired: validateRegistration(prefill, false).missingRequired,
    countryResolution,
  };
}

function isBlank(v: string) {
  return !v.trim();
}

export function validateRegistration(draft: RegistrationDraft, paid: boolean) {
  const missing: string[] = [];
  if (isBlank(draft.business_name)) missing.push("business_name");
  if (isBlank(draft.country)) missing.push("country");
  if (!draft.naics_codes.length) missing.push("naics_codes");
  if (!draft.unspsc_codes.length) missing.push("unspsc_codes");
  if (!draft.owner_details.length) missing.push("owner_details");
  if (draft.business_description.trim().length < 30) missing.push("business_description");
  if (isBlank(draft.cert_type)) missing.push("cert_type");

  const ownershipTotal = draft.owner_details.reduce((sum, o) => sum + Number(o.ownershipPct || 0), 0);
  const invalidOwnershipPct = draft.owner_details.some(
    (owner) => !Number.isFinite(owner.ownershipPct) || owner.ownershipPct < 0 || owner.ownershipPct > 100,
  );
  if (invalidOwnershipPct) missing.push("owner_details_ownership_pct_invalid");
  const missingOwnerName = draft.owner_details.some((owner) => isBlank(owner.fullName));
  if (missingOwnerName) missing.push("owner_details_name");
  if (Math.abs(ownershipTotal - 100) > 0.01) missing.push("owner_details_total_100");
  if (!paid) missing.push("paid");

  return {
    missingRequired: missing,
    ownershipTotal,
    paid,
    isValid: missing.length === 0,
  };
}
