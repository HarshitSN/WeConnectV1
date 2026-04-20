import { NextResponse } from "next/server";
import {
  appendTerminal,
  getSession,
  upsertSessionAiDocumentAssessment,
} from "@/lib/session-store";
import { patchDomainState } from "@/lib/store/domain-store";
import { runDocumentVerification } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      documents?: Array<{ base64: string; mimeType: string }>;
    };

    const sessionId = body.sessionId;
    const documents = body.documents || [];

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    if (!documents.length) {
      return NextResponse.json({ error: "No documents provided" }, { status: 400 });
    }

    if (documents.length > 3) {
      return NextResponse.json({ error: "Maximum 3 documents allowed" }, { status: 400 });
    }

    const registration = getSession(sessionId)?.registration;
    if (!registration) {
      return NextResponse.json({ error: "Registration session not found" }, { status: 404 });
    }

    appendTerminal(sessionId, `[DOC_UPLOAD] Starting AI extraction/verification for ${documents.length} files...`);

    const result = await runDocumentVerification(
      registration.business_name,
      registration.country,
      documents
    );

    appendTerminal(
      sessionId,
      `[DOC_VERIFY] verified=${result.verified} confidence=${result.confidence}% report="${result.report}"`
    );
    upsertSessionAiDocumentAssessment(sessionId, {
      submittedCount: documents.length,
      verified: result.verified,
      confidence: result.confidence,
      summary: result.report,
      checkedAt: new Date().toISOString(),
    });
    const refreshed = getSession(sessionId)?.aiAssessmentReport;
    if (refreshed) {
      patchDomainState(sessionId, {
        aiAssessmentSummary: {
          status: refreshed.overall.status,
          score: refreshed.overall.score,
          updatedAt: refreshed.generatedAt,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
