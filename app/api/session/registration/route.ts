import { NextResponse } from "next/server";
import { getSession, setSessionPaid, setSessionRegistration } from "@/lib/session-store";
import { normalizeRegistrationDraft, validateRegistration } from "@/lib/registration";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sessionId?: string;
    registration?: unknown;
    paid?: boolean;
  };
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (body.registration !== undefined && !isRecord(body.registration)) {
    return NextResponse.json(
      { error: "registration must be an object" },
      { status: 400 },
    );
  }

  if (body.registration) {
    const normalizedRegistration = normalizeRegistrationDraft(body.registration);
    setSessionRegistration(sessionId, normalizedRegistration);
  }
  if (typeof body.paid === "boolean") {
    setSessionPaid(sessionId, body.paid);
  }

  const updated = getSession(sessionId);
  const validation = validateRegistration(
    updated?.registration ?? normalizeRegistrationDraft({}),
    updated?.paid ?? false,
  );
  return NextResponse.json({
    ok: true,
    registration: updated?.registration ?? null,
    paid: updated?.paid ?? false,
    missingRequired: validation.missingRequired,
    ownershipTotal: validation.ownershipTotal,
    isValid: validation.isValid,
  });
}
