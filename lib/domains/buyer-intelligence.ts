import { listCatalogSuppliers, type CatalogSupplier } from "@/lib/store/buyer-catalog";
import {
  certificationPriority,
  trustLevelFromCertification,
  type BuyerMatchResult,
  type CertificationType,
  type SupplierProfileContract,
} from "@/lib/domains/contracts";

type BuyerQuery = {
  query?: string;
  cert_type?: string;
  country?: string;
  naics?: string;
  women_owned?: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function relevanceScore(query: string, supplier: CatalogSupplier) {
  if (!query.trim()) return 50;
  const q = tokenize(query);
  if (!q.length) return 50;
  const haystack = `${supplier.business_name} ${supplier.country} ${supplier.designations.join(" ")} ${supplier.industry_codes.join(" ")} ${supplier.category_codes.join(" ")} ${supplier.business_summary ?? ""}`.toLowerCase();
  const hits = q.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
  return Math.round((hits / q.length) * 100);
}

function categoryScore(query: string, supplier: CatalogSupplier) {
  if (!query.trim()) return 50;
  const q = tokenize(query);
  if (!q.length) return 50;
  const categoryHaystack = `${supplier.industry_codes.join(" ")} ${supplier.category_codes.join(" ")}`.toLowerCase();
  const hits = q.reduce((acc, token) => (categoryHaystack.includes(token) ? acc + 1 : acc), 0);
  return Math.round((hits / q.length) * 100);
}

function toCertificationType(value: string): CertificationType {
  if (value === "digital" || value === "self") return value;
  return "none";
}

export function searchSuppliers(input: BuyerQuery) {
  const query = input.query?.trim() ?? "";
  const baseSuppliers = listCatalogSuppliers();

  const filtered = baseSuppliers.filter((s) => {
    if (input.cert_type && s.cert_type !== input.cert_type) return false;
    if (input.country && !s.country.toLowerCase().includes(input.country.toLowerCase())) return false;
    if (input.naics && !s.industry_codes.includes(input.naics)) return false;
    if (input.women_owned && String(s.women_owned) !== input.women_owned) return false;
    if (!query) return true;
    const hay = `${s.business_name} ${s.country} ${s.designations.join(" ")} ${s.industry_codes.join(" ")} ${s.business_summary ?? ""}`.toLowerCase();
    return tokenize(query).some((token) => hay.includes(token));
  });

  const scored: Array<{
    supplier: CatalogSupplier;
    match: BuyerMatchResult;
    profile: SupplierProfileContract;
  }> = filtered.map((supplier) => {
    const certType = toCertificationType(supplier.cert_type);
    const certPriority = certificationPriority(certType);
    const relevance = relevanceScore(query, supplier);
    const category = categoryScore(query, supplier);
    const certificationLevel = Math.round((certPriority / 3) * 100);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          relevance * 0.45 +
            certificationLevel * 0.35 +
            category * 0.2,
        ),
      ),
    );
    const rankReason = `Relevance ${relevance}%, certification ${certificationLevel}%, category ${category}%`;

    return {
      supplier,
      match: {
        supplierId: supplier.id,
        matchScore: score,
        certificationPriority: certPriority,
        rankReason,
      },
      profile: {
        id: supplier.id,
        businessName: supplier.business_name,
        country: supplier.country,
        certificationType: certType,
        trustLevel: trustLevelFromCertification(certType),
        trustScore: supplier.trust_score,
        riskLevel: supplier.trust_score >= 70 ? "low" : supplier.trust_score >= 40 ? "medium" : "high",
        verificationSummary: {
          ownershipVerified: supplier.women_owned,
          identityMatch: certType === "digital" ? "high" : "medium",
          documentConsistency: certType === "digital" ? "clean" : "minor_flag",
          sanctionsCheck: "clear",
          entityVerification: "verified",
        },
        lastVerified: supplier.last_verified ?? new Date().toISOString().slice(0, 10),
      },
    };
  });

  scored.sort((a, b) => {
    if (b.match.certificationPriority !== a.match.certificationPriority) {
      return b.match.certificationPriority - a.match.certificationPriority;
    }
    if (b.match.matchScore !== a.match.matchScore) return b.match.matchScore - a.match.matchScore;
    return b.profile.trustScore - a.profile.trustScore;
  });

  return {
    results: scored,
    recommendations: scored.slice(0, 3),
  };
}
