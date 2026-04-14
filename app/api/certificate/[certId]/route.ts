import { NextResponse } from "next/server";
import { getCertificate } from "@/lib/session-store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ certId: string }> },
) {
  const { certId } = await ctx.params;
  const cert = getCertificate(certId);
  if (!cert) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(cert);
}
