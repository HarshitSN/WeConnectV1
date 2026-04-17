import { MOCK_SUPPLIERS } from "@/lib/constants";

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

const catalog = new Map<string, CatalogSupplier>();

for (const supplier of MOCK_SUPPLIERS) {
  catalog.set(supplier.id, {
    ...supplier,
    business_summary:
      supplier.business_summary ??
      `${supplier.business_name} provides category-aligned services for global procurement teams.`,
    clients_worked_with: supplier.clients_worked_with ?? "Worked with 8 enterprise clients (mock)",
  });
}

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
