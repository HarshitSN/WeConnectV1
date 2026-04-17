import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { buildVerificationSummary, generateTrustReport } from "@/lib/domains/trust-report";
import { getDomainState } from "@/lib/store/domain-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const workflow = getDomainState(sessionId);
  const report = workflow.trustReport;
  const verificationSummary = buildVerificationSummary(sessionId, session);

  return NextResponse.json({
    ok: true,
    trustReport: report ?? null,
    verificationSummary,
    workflow,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { sessionId?: string };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const trustReport = generateTrustReport(body.sessionId, session);
  const verificationSummary = buildVerificationSummary(body.sessionId, session);
  const workflow = getDomainState(body.sessionId);

  return NextResponse.json({ ok: true, trustReport, verificationSummary, workflow });
}
