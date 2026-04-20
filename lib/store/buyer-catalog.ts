import { MOCK_SUPPLIERS, NAICS_CODES, UNSPSC_CODES } from "@/lib/constants";

export type CatalogSupplier = {
  id: string;
  business_name: string;
  country: string;
  industry_codes: string[];
  category_codes: string[];
  designations: string[];
  cert_type: "none" | "self" | "digital" | "auditor";
  cert_status: "active" | "pending" | "expired" | "revoked";
  trust_score: number;
  blockchain_verified: boolean;
  women_owned: boolean;
  last_verified?: string;
  business_summary?: string;
  clients_worked_with?: string;
};

const globalCatalogStore = global as typeof global & {
  catalog?: Map<string, CatalogSupplier>;
};

const catalog = globalCatalogStore.catalog || new Map<string, CatalogSupplier>();
if (!globalCatalogStore.catalog) globalCatalogStore.catalog = catalog;

for (const supplier of MOCK_SUPPLIERS) {
  catalog.set(supplier.id, {
    ...supplier,
    business_summary:
      supplier.business_summary ??
      `${supplier.business_name} provides category-aligned services for global procurement teams.`,
    clients_worked_with: supplier.clients_worked_with ?? "Worked with 8 enterprise clients (mock)",
  });
}

// Keep demo filters richly populated: each NAICS industry should show at least
// 3 suppliers with varied cert/status ownership combinations.
const certTypeCycle: Array<CatalogSupplier["cert_type"]> = ["digital", "self", "none"];
const certStatusCycle: Array<CatalogSupplier["cert_status"]> = ["active", "pending", "expired"];
const countryPool = [
  "United States",
  "India",
  "Canada",
  "Germany",
  "Singapore",
  "United Kingdom",
  "Australia",
  "United Arab Emirates",
];
const designationPool = [
  "Women-Owned",
  "Women-Led Business",
  "Small Business",
  "Minority-Owned Business",
  "Export Ready",
  "Sustainable Supplier",
];

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function ensureIndustryCoverage() {
  for (const [industryIdx, industry] of NAICS_CODES.entries()) {
    const existing = [...catalog.values()].filter((s) => s.industry_codes.includes(industry.code));
    const needed = Math.max(0, 3 - existing.length);
    for (let i = 0; i < needed; i++) {
      const variantIdx = existing.length + i;
      const id = `auto-${industry.code}-${variantIdx + 1}-${toSlug(industry.label).slice(0, 18)}`;
      if (catalog.has(id)) continue;
      const certType = certTypeCycle[(industryIdx + variantIdx) % certTypeCycle.length];
      const certStatus = certStatusCycle[(industryIdx + variantIdx) % certStatusCycle.length];
      const womenOwned = (industryIdx + variantIdx) % 2 === 0;
      const labelPrefix = industry.label.split(",")[0].split(" and ")[0].trim();
      const category = UNSPSC_CODES[(industryIdx * 3 + variantIdx) % UNSPSC_CODES.length];
      const country = countryPool[(industryIdx + variantIdx) % countryPool.length];
      const trustScore = certType === "digital" ? 88 - (variantIdx % 4) : certType === "self" ? 76 - (variantIdx % 6) : 62 - (variantIdx % 5);
      const trustNormalized = Math.max(45, Math.min(96, trustScore));

      catalog.set(id, {
        id,
        business_name: `${labelPrefix} Collective ${variantIdx + 1}`,
        country,
        industry_codes: [industry.code],
        category_codes: [category.code],
        designations: [
          designationPool[(industryIdx + variantIdx) % designationPool.length],
          designationPool[(industryIdx + variantIdx + 2) % designationPool.length],
        ],
        cert_type: certType,
        cert_status: certStatus,
        trust_score: trustNormalized,
        blockchain_verified: certType === "digital",
        women_owned: womenOwned,
        last_verified: `2026-0${((industryIdx + variantIdx) % 9) + 1}-${String(((industryIdx + variantIdx) % 26) + 1).padStart(2, "0")}`,
        business_summary: `${labelPrefix} supplier supporting enterprise procurement requirements in ${country}.`,
        clients_worked_with: `Worked with ${6 + ((industryIdx + variantIdx) % 18)} enterprise clients (mock)`,
      });
    }
  }
}

ensureIndustryCoverage();

export function listCatalogSuppliers(): CatalogSupplier[] {
  return [...catalog.values()];
}

export function upsertCatalogSupplier(supplier: CatalogSupplier): CatalogSupplier {
  catalog.set(supplier.id, supplier);
  return supplier;
}

export function upsertCertifiedSupplierFromSession(input: {
  id: string;
  businessName: string;
  country: string;
  naicsCodes: string[];
  unspscCodes: string[];
  designations: string[];
  certType: "self" | "digital";
  trustScore: number;
  blockchainVerified: boolean;
  womenOwned: boolean;
  businessSummary?: string;
  clientsWorkedWith?: string;
  lastVerified: string;
}) {
  const existing = catalog.get(input.id);
  const next: CatalogSupplier = {
    id: input.id,
    business_name: input.businessName,
    country: input.country,
    industry_codes: input.naicsCodes.length ? input.naicsCodes : existing?.industry_codes ?? ["54"],
    category_codes: input.unspscCodes.length ? input.unspscCodes : existing?.category_codes ?? ["80000000"],
    designations: input.designations.length ? input.designations : existing?.designations ?? ["Women-Owned"],
    cert_type: input.certType,
    cert_status: "active",
    trust_score: input.trustScore,
    blockchain_verified: input.blockchainVerified,
    women_owned: input.womenOwned,
    last_verified: input.lastVerified,
    business_summary:
      input.businessSummary?.trim() ||
      existing?.business_summary ||
      `${input.businessName} is procurement-ready with completed WEConnect verification checks.`,
    clients_worked_with:
      input.clientsWorkedWith?.trim() || existing?.clients_worked_with || "Worked with 5 enterprise clients (mock)",
  };
  catalog.set(next.id, next);
  return next;
}
