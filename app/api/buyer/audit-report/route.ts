import { NextResponse } from "next/server";

type AuditRequest = {
  supplier?: {
    supplier?: {
      id: string;
      business_name: string;
      country: string;
      cert_type: string;
      cert_status: string;
      trust_score: number;
      industry_codes: string[];
      category_codes: string[];
      business_summary?: string;
      clients_worked_with?: string;
      women_owned?: boolean;
      blockchain_verified?: boolean;
      last_verified?: string;
    };
    profile?: {
      trustLevel: string;
      trustScore: number;
      riskLevel: string;
      lastVerified: string;
      verificationSummary?: {
        ownershipVerified: boolean;
        identityMatch: string;
        documentConsistency: string;
        sanctionsCheck: string;
        entityVerification: string;
      };
    };
    match?: {
      matchScore: number;
      rankReason: string;
    };
  };
  query?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as AuditRequest;
  const supplier = body.supplier?.supplier;
  const profile = body.supplier?.profile;
  const match = body.supplier?.match;

  if (!supplier || !profile || !match) {
    return NextResponse.json(
      { ok: false, message: "supplier payload is required." },
      { status: 400 },
    );
  }

  const generatedAt = new Date().toISOString();
  const fileSafeName = supplier.business_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `audit-report-${fileSafeName}.txt`;

  const lines = [
    "WEConnect Buyer Audit Report (Mock)",
    `Generated At: ${generatedAt}`,
    "",
    `Supplier: ${supplier.business_name}`,
    `Supplier ID: ${supplier.id}`,
    `Country: ${supplier.country}`,
    `Certification: ${supplier.cert_type} (${supplier.cert_status})`,
    `Trust Score: ${profile.trustScore}`,
    `Risk Level: ${profile.riskLevel}`,
    `Trust Level: ${profile.trustLevel}`,
    `Last Verified: ${profile.lastVerified || supplier.last_verified || "N/A"}`,
    "",
    `Match Score: ${match.matchScore}%`,
    `Match Rationale: ${match.rankReason}`,
    `Buyer Query: ${body.query?.trim() || "N/A"}`,
    "",
    `Industry (NAICS): ${supplier.industry_codes.join(", ") || "N/A"}`,
    `Category (UNSPSC): ${supplier.category_codes.join(", ") || "N/A"}`,
    `Women Owned: ${supplier.women_owned ? "Yes" : "No"}`,
    `Blockchain Verified: ${supplier.blockchain_verified ? "Yes" : "No"}`,
    `Summary: ${supplier.business_summary || "N/A"}`,
    `Credibility: ${supplier.clients_worked_with || "N/A"}`,
    "",
    "Verification Summary:",
    `- Ownership Verified: ${profile.verificationSummary?.ownershipVerified ?? "N/A"}`,
    `- Identity Match: ${profile.verificationSummary?.identityMatch ?? "N/A"}`,
    `- Document Consistency: ${profile.verificationSummary?.documentConsistency ?? "N/A"}`,
    `- Sanctions Check: ${profile.verificationSummary?.sanctionsCheck ?? "N/A"}`,
    `- Entity Verification: ${profile.verificationSummary?.entityVerification ?? "N/A"}`,
    "",
    "Note: This report is demo data intended for product flow validation.",
    "",
  ];

  return NextResponse.json({
    ok: true,
    fileName,
    generatedAt,
    content: lines.join("\n"),
  });
}
