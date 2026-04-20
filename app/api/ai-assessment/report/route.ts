import { NextResponse } from "next/server";
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { getSession } from "@/lib/session-store";

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    fontSize: number;
    lineHeight: number;
    color: ReturnType<typeof rgb>;
    font: PDFFont;
  },
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    const width = options.font.widthOfTextAtSize(probe, options.fontSize);
    if (width <= options.maxWidth) {
      current = probe;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  for (const line of lines) {
    page.drawText(line, {
      x: options.x,
      y: options.y,
      size: options.fontSize,
      color: options.color,
      font: options.font,
    });
    options.y -= options.lineHeight;
  }

  return options.y;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    const report = session.aiAssessmentReport;
    if (!report || !report.documents || !report.identity) {
      return NextResponse.json(
        { error: "AI assessment report is not ready yet" },
        { status: 409 },
      );
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = 800;
    const left = 50;
    const contentWidth = 495;

    page.drawText("WEConnect AI Assessment Report", {
      x: left,
      y,
      size: 20,
      font: titleFont,
      color: rgb(0.07, 0.23, 0.42),
    });
    y -= 28;

    page.drawText(`Session ID: ${session.id}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 16;
    page.drawText(`Generated At: ${new Date(report.generatedAt).toLocaleString()}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 28;

    page.drawText("Overview", {
      x: left,
      y,
      size: 14,
      font: titleFont,
      color: rgb(0.07, 0.23, 0.42),
    });
    y -= 18;
    page.drawText(`Overall Status: ${report.overall.status.toUpperCase()}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Overall Score: ${report.overall.score}%`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 24;

    page.drawText("Document Verification (mock)", {
      x: left,
      y,
      size: 13,
      font: titleFont,
      color: rgb(0.07, 0.23, 0.42),
    });
    y -= 18;
    page.drawText(`Submitted Documents: ${report.documents.submittedCount}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Verification Result: ${report.documents.verified ? "PASS" : "REVIEW"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Confidence Score: ${report.documents.confidence}%`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    y = drawWrappedText(page, `Summary: ${report.documents.summary}`, {
      x: left,
      y,
      maxWidth: contentWidth,
      fontSize: 10.5,
      lineHeight: 14,
      color: rgb(0.18, 0.18, 0.18),
      font: bodyFont,
    });
    y -= 10;

    page.drawText("ID-Face Match (mock)", {
      x: left,
      y,
      size: 13,
      font: titleFont,
      color: rgb(0.07, 0.23, 0.42),
    });
    y -= 18;
    page.drawText(`Match Outcome: ${report.identity.idFaceMatch ? "PASS" : "REVIEW"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Match Score: ${report.identity.matchScore}%`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Liveness Hint: ${report.identity.livenessHint ?? "n/a"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
    page.drawText(`Name Guess: ${report.identity.nameGuess ?? "n/a"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 20;

    y = drawWrappedText(page, `Disclaimer: ${report.disclaimer}`, {
      x: left,
      y,
      maxWidth: contentWidth,
      fontSize: 10,
      lineHeight: 14,
      color: rgb(0.55, 0.2, 0.08),
      font: bodyFont,
    });
    y -= 8;
    page.drawText(`Version: ${report.version}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: rgb(0.35, 0.35, 0.35),
    });

    const bytes = await pdfDoc.save();
    const companyToken = sanitizeToken(session.registration?.business_name ?? "supplier");
    const filename = `ai-assessment-${companyToken}-${session.id.slice(0, 8)}.pdf`;

    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
