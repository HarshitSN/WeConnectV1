import { NextResponse } from "next/server";
import { appendTerminal, listCertificates, revokeCertificate } from "@/lib/session-store";

export async function POST() {
  const now = Date.now();
  const candidates = listCertificates().filter((c) => !c.revoked);
  const revoked: string[] = [];
  for (const cert of candidates) {
    const ageMs = now - new Date(cert.issuedAt).getTime();
    const deterministicSignal = Number.parseInt(cert.id.slice(0, 2), 16) % 5 === 0;
    if (ageMs > 30_000 && deterministicSignal) {
      const reason = "Registry watcher tick: director/ownership delta (simulated)";
      if (revokeCertificate(cert.id, reason)) {
        revoked.push(cert.id);
        appendTerminal(cert.sessionId, `[REGISTRY_WATCH] delta_detected cert=${cert.id}`);
        appendTerminal(cert.sessionId, `[QID_CHAIN] REVOKED cert=${cert.id} reason="${reason}"`);
        appendTerminal(cert.sessionId, "[BUYER_PORTAL] notify_buyer_portal certificate_revoked=true");
      }
    }
  }
  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    revoked,
  });
}
