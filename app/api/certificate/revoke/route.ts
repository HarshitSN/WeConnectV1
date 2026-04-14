import { NextResponse } from "next/server";
import { appendTerminal, getCertificate, getSession, revokeCertificate } from "@/lib/session-store";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    certId?: string;
    sessionId?: string;
    reason?: string;
  };
  const certId = body.certId;
  const reason = body.reason ?? "Registry delta: director change (simulated)";
  if (!certId) {
    return NextResponse.json({ error: "certId required" }, { status: 400 });
  }
  const cert = getCertificate(certId);
  if (!cert) {
    return NextResponse.json({ error: "certificate not found" }, { status: 404 });
  }

  revokeCertificate(certId, reason);

  const session = getSession(cert.sessionId);
  if (session) {
    appendTerminal(
      cert.sessionId,
      `[QID_CHAIN] REVOKED cert=${certId} reason="${reason}"`,
    );
    appendTerminal(
      cert.sessionId,
      "[BUYER_PORTAL] notify_buyer_portal certificate_revoked=true",
    );
  }

  return NextResponse.json({ ok: true, certId, revoked: true, reason });
}
