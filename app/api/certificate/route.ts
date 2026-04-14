import { NextResponse } from "next/server";
import { listCertificates } from "@/lib/session-store";

export async function GET() {
  return NextResponse.json({ certificates: listCertificates() });
}
