import { NextResponse } from "next/server";
import { createSession, ensureSession } from "@/lib/session-store";
import { getDomainState } from "@/lib/store/domain-store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const s = body.sessionId ? createSession(body.sessionId) : createSession();
  getDomainState(s.id);
  return NextResponse.json({
    sessionId: s.id,
    stage: s.stage,
    terminalLines: s.terminalLines,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const s = ensureSession(id);
  const workflow = getDomainState(id);
  return NextResponse.json({
    sessionId: s.id,
    stage: s.stage,
    companyId: s.companyId,
    registration: s.registration,
    paid: s.paid ?? false,
    selectedCandidate: s.selectedCandidate,
    discoveryMeta: s.discoveryMeta,
    visionChecks: s.visionChecks,
    terminalLines: s.terminalLines,
    certId: s.certId,
    messages: s.messages,
    lastVision: s.lastVision,
    attestation: s.attestation,
    aiAssessmentReport: s.aiAssessmentReport,
    geminiFallbacks: s.geminiFallbacks ?? [],
    workflow,
    updatedAt: s.updatedAt,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const id = body.sessionId;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const s = ensureSession(id);
  
  if (body.stage) {
    s.stage = body.stage;
  }
  
  return NextResponse.json({ ok: true });
}
