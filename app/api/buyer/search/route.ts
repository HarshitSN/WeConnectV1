import { NextResponse } from "next/server";
import { searchSuppliers } from "@/lib/domains/buyer-intelligence";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";
  const cert_type = searchParams.get("cert_type") ?? "";
  const country = searchParams.get("country") ?? "";
  const naics = searchParams.get("naics") ?? "";
  const women_owned = searchParams.get("women_owned") ?? "";

  const out = searchSuppliers({ query, cert_type, country, naics, women_owned });

  return NextResponse.json({
    ok: true,
    query,
    results: out.results.map((r) => ({
      supplier: r.supplier,
      profile: r.profile,
      match: r.match,
    })),
    recommendations: out.recommendations.map((r) => ({
      supplier: r.supplier,
      profile: r.profile,
      match: r.match,
    })),
  });
}
