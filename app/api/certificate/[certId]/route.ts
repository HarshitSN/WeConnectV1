import { NextResponse } from "next/server";
import { getCertificate, getSession } from "@/lib/session-store";
import { getDomainState } from "@/lib/store/domain-store";
import { generateTrustReport } from "@/lib/domains/trust-report";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ certId: string }> },
) {
  const { certId } = await ctx.params;
  const cert = getCertificate(certId);
  if (!cert) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const session = getSession(cert.sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  const workflow = getDomainState(cert.sessionId);
  const report = workflow.trustReport ?? generateTrustReport(cert.sessionId, session);
  const validTill =
    workflow.governance.validTill ??
    new Date(new Date(cert.issuedAt).setFullYear(new Date(cert.issuedAt).getFullYear() + 3)).toISOString();

  return NextResponse.json({
    ...cert,
    companyName: cert.companyName,
    certificationType: workflow.certificationType,
    trustLevel: workflow.trustLevel,
    status: cert.revoked ? "revoked" : "active",
    trustScore: report.trustScore,
    riskLevel: report.riskLevel,
    blockchainHash: cert.txHash,
    validTill,
    verificationSummary: {
      ownershipVerified: report.ownershipVerified,
      identityMatch: report.identityMatch,
      documentConsistency: report.documentConsistency,
    },
    lastVerified: report.generatedAt,
  });
}
