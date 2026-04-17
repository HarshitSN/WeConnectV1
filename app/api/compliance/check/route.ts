import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { runComplianceCheck } from "@/lib/domains/compliance-risk";
import { getDomainState } from "@/lib/store/domain-store";

export async function POST(req: Request) {
  const body = (await req.json()) as { sessionId?: string };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const compliance = runComplianceCheck(body.sessionId, session);
  const workflow = getDomainState(body.sessionId);

  return NextResponse.json({ ok: true, compliance, workflow });
}
