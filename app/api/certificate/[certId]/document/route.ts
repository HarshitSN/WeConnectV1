import { NextResponse } from "next/server";
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { getCertificate, getSession } from "@/lib/session-store";
import { getDomainState } from "@/lib/store/domain-store";
import { generateTrustReport } from "@/lib/domains/trust-report";

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

function certificationLabel(value: string | undefined): string {
  if (value === "digital") return "Digitally Certified";
  if (value === "self") return "Self Certified";
  return "Self Declared";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ certId: string }> },
) {
  try {
    const { certId } = await ctx.params;
    const cert = getCertificate(certId);
    if (!cert) {
      return NextResponse.json({ error: "certificate not found" }, { status: 404 });
    }

    const session = getSession(cert.sessionId);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const workflow = getDomainState(cert.sessionId);
    const report = workflow.trustReport ?? generateTrustReport(cert.sessionId, session);
    const validTill =
      workflow.governance.validTill ??
      new Date(new Date(cert.issuedAt).setFullYear(new Date(cert.issuedAt).getFullYear() + 3)).toISOString();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const white = rgb(1, 1, 1);
    const black = rgb(0.09, 0.09, 0.09);
    const yellow = rgb(250 / 255, 196 / 255, 0);
    const muted = rgb(0.28, 0.28, 0.28);

    const left = 48;
    const contentWidth = 499;
    let y = 786;

    page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, color: white, borderColor: black, borderWidth: 2 });
    page.drawRectangle({ x: 20, y: 748, width: 555, height: 74, color: black });
    page.drawRectangle({ x: 20, y: 734, width: 555, height: 14, color: yellow });

    page.drawText("WEConnect Provisional Certificate", {
      x: left,
      y,
      size: 28,
      font: titleFont,
      color: yellow,
    });
    y -= 34;
    page.drawText("Digital Trust and Verification", {
      x: left,
      y,
      size: 13,
      font: titleFont,
      color: white,
    });

    y = 680;
    page.drawText("This certifies that", {
      x: left,
      y,
      size: 14,
      font: bodyFont,
      color: muted,
    });
    y -= 34;

    page.drawRectangle({
      x: left - 10,
      y: y - 36,
      width: contentWidth - 16,
      height: 52,
      color: yellow,
    });
    page.drawText(cert.companyName, {
      x: left,
      y: y - 10,
      size: 24,
      font: titleFont,
      color: black,
    });
    y -= 64;

    page.drawText("has successfully completed the WEConnect verification process.", {
      x: left,
      y,
      size: 12,
      font: bodyFont,
      color: muted,
    });
    y -= 30;

    const details: Array<[string, string]> = [
      ["Certificate ID", cert.id],
      ["Certification Type", certificationLabel(workflow.certificationType)],
      ["Trust Score", `${report.trustScore}/100 (${report.riskLevel.toUpperCase()} RISK)`],
      ["Issued On", new Date(cert.issuedAt).toLocaleString()],
      ["Valid Through", new Date(validTill).toLocaleDateString()],
      ["Primary Owner", cert.primaryOwner],
      ["Female Ownership", `${cert.ownershipFemalePct}%`],
      ["Identity Match", report.identityMatch.toUpperCase()],
      ["Document Consistency", report.documentConsistency.toUpperCase()],
    ];

    for (const [label, value] of details) {
      page.drawText(`${label}:`, {
        x: left,
        y,
        size: 10.5,
        font: titleFont,
        color: black,
      });
      page.drawText(value, {
        x: left + 140,
        y,
        size: 10.5,
        font: bodyFont,
        color: muted,
      });
      y -= 18;
    }

    y -= 8;
    page.drawRectangle({
      x: left - 10,
      y: y - 62,
      width: contentWidth - 16,
      height: 62,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });
    y = drawWrappedText(page, `Blockchain Anchor TX: ${cert.txHash}`, {
      x: left,
      y: y - 20,
      maxWidth: contentWidth - 36,
      fontSize: 10,
      lineHeight: 13,
      color: muted,
      font: bodyFont,
    });

    const signatureY = 120;
    page.drawLine({
      start: { x: left, y: signatureY },
      end: { x: left + 170, y: signatureY },
      color: black,
      thickness: 1,
    });
    page.drawLine({
      start: { x: left + 250, y: signatureY },
      end: { x: left + 420, y: signatureY },
      color: black,
      thickness: 1,
    });
    page.drawText("Verification Authority", {
      x: left + 20,
      y: signatureY - 16,
      size: 9,
      font: bodyFont,
      color: muted,
    });
    page.drawText("QID Chain Anchor", {
      x: left + 300,
      y: signatureY - 16,
      size: 9,
      font: bodyFont,
      color: muted,
    });

    page.drawRectangle({ x: 20, y: 20, width: 555, height: 26, color: black });
    page.drawText("Issued by WEConnect Trust Engine", {
      x: left,
      y: 29,
      size: 10,
      font: titleFont,
      color: yellow,
    });

    const bytes = await pdfDoc.save();
    const companyToken = sanitizeToken(cert.companyName || "supplier");
    const filename = `weconnect-certificate-${companyToken}-${cert.id.slice(0, 8)}.pdf`;

    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not generate certificate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
