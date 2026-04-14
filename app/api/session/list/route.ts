import { NextResponse } from "next/server";
import { listSessions } from "@/lib/session-store";

export async function GET() {
  const rows = listSessions().map((s) => ({
    id: s.id,
    stage: s.stage,
    companyId: s.companyId,
    certId: s.certId,
    updatedAt: s.updatedAt,
    terminalLineCount: s.terminalLines.length,
  }));
  return NextResponse.json({ sessions: rows });
}
