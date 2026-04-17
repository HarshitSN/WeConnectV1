import { NextResponse } from "next/server";
import { getSession, setSessionPaid, setSessionRegistration } from "@/lib/session-store";
import { normalizeRegistrationDraft, validateRegistration } from "@/lib/registration";
import { patchDomainState, pushGovernanceNotification } from "@/lib/store/domain-store";
import { trustLevelFromCertification } from "@/lib/domains/contracts";
import { upsertCatalogSupplier } from "@/lib/store/buyer-catalog";

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
    if (normalizedRegistration.cert_type === "self" || normalizedRegistration.cert_type === "digital") {
      patchDomainState(sessionId, {
        certificationType: normalizedRegistration.cert_type,
        trustLevel: trustLevelFromCertification(normalizedRegistration.cert_type),
        certificationStage:
          normalizedRegistration.cert_type === "digital" ? "digital_verification" : "self_certification",
      });
    }
    if (normalizedRegistration.cert_type === "self" && normalizedRegistration.business_name.trim()) {
      upsertCatalogSupplier({
        id: `draft-${sessionId}`,
        business_name: normalizedRegistration.business_name,
        country: normalizedRegistration.country || "Unknown",
        industry_codes: normalizedRegistration.naics_codes.length ? normalizedRegistration.naics_codes : ["54"],
        category_codes: normalizedRegistration.unspsc_codes.length ? normalizedRegistration.unspsc_codes : ["80000000"],
        designations: normalizedRegistration.designations.length
          ? normalizedRegistration.designations
          : ["Women-Owned"],
        cert_type: "self",
        cert_status: "pending",
        trust_score: 68,
        blockchain_verified: false,
        women_owned: Boolean(normalizedRegistration.women_owned),
        last_verified: new Date().toISOString().slice(0, 10),
        business_summary:
          normalizedRegistration.business_description ||
          `${normalizedRegistration.business_name} is completing self-certification checks.`,
        clients_worked_with: "Worked with 3 clients (self-reported mock)",
      });
      pushGovernanceNotification(
        sessionId,
        "Self-certification profile synced to buyer marketplace (pending)",
      );
    }
  }
  if (typeof body.paid === "boolean") {
    setSessionPaid(sessionId, body.paid);
    const payment = body.paid
      ? { state: "hold_placed" as const, amountUsd: 100, holdAt: new Date().toISOString() }
      : { state: "not_started" as const, amountUsd: 100 };
    patchDomainState(sessionId, { payment });
    pushGovernanceNotification(
      sessionId,
      body.paid ? "$100 payment hold placed (approval pending)" : "Payment hold removed/reset",
    );
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
