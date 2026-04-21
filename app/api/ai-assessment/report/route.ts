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

function replaceMockWord(text: string): string {
  return text.replace(/\bmock\b/gi, "simulated");
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

    const white = rgb(1, 1, 1);
    const black = rgb(0.08, 0.08, 0.08);
    const yellow = rgb(250 / 255, 196 / 255, 0);
    const softBlack = rgb(0.2, 0.2, 0.2);
    const muted = rgb(0.35, 0.35, 0.35);
    const cleanedDisclaimer = replaceMockWord(report.disclaimer);
    const cleanedVersion = replaceMockWord(report.version).replace(/v1-simulated/i, "v1-demo");

    let y = 800;
    const left = 50;
    const contentWidth = 495;

    page.drawRectangle({
      x: 0,
      y: 756,
      width: 595,
      height: 86,
      color: black,
    });
    page.drawRectangle({
      x: 0,
      y: 740,
      width: 595,
      height: 16,
      color: yellow,
    });

    page.drawText("WEConnect AI Assessment Report", {
      x: left,
      y,
      size: 24,
      font: titleFont,
      color: white,
    });
    y -= 28;

    page.drawText(`Session ID: ${session.id}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: white,
    });
    y -= 16;
    page.drawText(`Generated At: ${new Date(report.generatedAt).toLocaleString()}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: white,
    });
    y -= 22;

    page.drawRectangle({
      x: left,
      y: y - 82,
      width: contentWidth,
      height: 82,
      color: yellow,
      borderColor: black,
      borderWidth: 1.5,
    });
    page.drawText("OVERALL SCORE", {
      x: left + 16,
      y: y - 24,
      size: 13,
      font: titleFont,
      color: black,
    });
    page.drawText(`${report.overall.score}%`, {
      x: left + 16,
      y: y - 68,
      size: 40,
      font: titleFont,
      color: black,
    });
    page.drawText(`Status: ${report.overall.status.toUpperCase()}`, {
      x: left + 210,
      y: y - 44,
      size: 15,
      font: titleFont,
      color: black,
    });
    y -= 104;

    page.drawText("Assessment Overview", {
      x: left,
      y,
      size: 14,
      font: titleFont,
      color: black,
    });
    y -= 18;
    page.drawText(
      `This report combines document verification and ID-face match checks for risk triage.`,
      {
        x: left,
        y,
        size: 10.5,
        font: bodyFont,
        color: softBlack,
      },
    );
    y -= 22;

    page.drawRectangle({
      x: left,
      y: y - 120,
      width: contentWidth,
      height: 120,
      borderColor: black,
      borderWidth: 1,
      color: white,
    });
    page.drawRectangle({
      x: left,
      y: y - 24,
      width: 230,
      height: 24,
      color: yellow,
    });
    page.drawText("Document Verification", {
      x: left + 10,
      y: y - 16,
      size: 12,
      font: titleFont,
      color: black,
    });
    y -= 40;
    page.drawText(`Submitted Documents: ${report.documents.submittedCount}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 14;
    page.drawText(`Verification Result: ${report.documents.verified ? "PASS" : "REVIEW"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 14;
    page.drawText(`Confidence Score: ${report.documents.confidence}%`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 16;
    y = drawWrappedText(page, `Summary: ${report.documents.summary}`, {
      x: left,
      y,
      maxWidth: contentWidth,
      fontSize: 10.5,
      lineHeight: 14,
      color: softBlack,
      font: bodyFont,
    });
    y -= 20;

    page.drawRectangle({
      x: left,
      y: y - 112,
      width: contentWidth,
      height: 112,
      borderColor: black,
      borderWidth: 1,
      color: white,
    });
    page.drawRectangle({
      x: left,
      y: y - 24,
      width: 190,
      height: 24,
      color: yellow,
    });
    page.drawText("ID-Face Match", {
      x: left + 10,
      y: y - 16,
      size: 12,
      font: titleFont,
      color: black,
    });
    y -= 40;
    page.drawText(`Match Outcome: ${report.identity.idFaceMatch ? "PASS" : "REVIEW"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 14;
    page.drawText(`Match Score: ${report.identity.matchScore}%`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 14;
    page.drawText(`Liveness Hint: ${report.identity.livenessHint ?? "n/a"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 14;
    page.drawText(`Name Guess: ${report.identity.nameGuess ?? "n/a"}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
      color: black,
    });
    y -= 20;

    y = drawWrappedText(page, `Disclaimer: ${cleanedDisclaimer}`, {
      x: left,
      y,
      maxWidth: contentWidth,
      fontSize: 10,
      lineHeight: 14,
      color: muted,
      font: bodyFont,
    });
    y -= 8;
    page.drawText(`Version: ${cleanedVersion}`, {
      x: left,
      y,
      size: 10,
      font: bodyFont,
      color: muted,
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 28,
      color: black,
    });
    page.drawText("Bottom Note: This is a mock assessment PDF for workflow demonstration.", {
      x: left,
      y: 10,
      size: 9.5,
      font: bodyFont,
      color: yellow,
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
