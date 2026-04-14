import { NextResponse } from "next/server";
import { createSession, getSession } from "@/lib/session-store";

export async function POST() {
  const s = createSession();
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
  const s = getSession(id);
  if (!s) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
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
    geminiFallbacks: s.geminiFallbacks ?? [],
    updatedAt: s.updatedAt,
  });
}
