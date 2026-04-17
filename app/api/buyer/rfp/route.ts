import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    supplierId?: string;
    supplierName?: string;
    buyerQuery?: string;
  };

  if (!body.supplierId || !body.supplierName) {
    return NextResponse.json(
      { ok: false, message: "supplierId and supplierName are required." },
      { status: 400 },
    );
  }

  const inviteId = `RFP-${Date.now().toString(36).toUpperCase()}`;
  const summary = body.buyerQuery?.trim()
    ? `Requirement: ${body.buyerQuery.trim()}`
    : "Requirement: not provided";

  return NextResponse.json({
    ok: true,
    inviteId,
    status: "sent",
    message: `Invite sent to ${body.supplierName}. ${summary}`,
  });
}
