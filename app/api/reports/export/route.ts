import PDFDocument from "pdfkit";
import {
  formatPercent,
  getCallBoostReport,
  normalizeReportRange,
} from "../../../lib/reports";

export const runtime = "nodejs";

function formatDate(value: string | null) {
  if (!value) return "All time";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function drawHeading(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(1.2);
  doc.fontSize(15).font("Helvetica-Bold").fillColor("#111827").text(text);
  doc.moveDown(0.4);
}

function drawKeyValue(doc: PDFKit.PDFDocument, label: string, value: string | number) {
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#374151")
    .text(`${label}: `, { continued: true })
    .font("Helvetica")
    .fillColor("#111827")
    .text(String(value));
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[]
) {
  const left = doc.x;
  let y = doc.y;

  function ensureSpace(height = 24) {
    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
  }

  ensureSpace();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
  headers.forEach((header, index) => {
    doc.text(header, left + widths.slice(0, index).reduce((a, b) => a + b, 0), y, {
      width: widths[index],
    });
  });
  y += 16;
  doc.moveTo(left, y - 4).lineTo(left + widths.reduce((a, b) => a + b, 0), y - 4).strokeColor("#d1d5db").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#374151");

  for (const row of rows) {
    ensureSpace();
    row.forEach((cell, index) => {
      doc.text(String(cell), left + widths.slice(0, index).reduce((a, b) => a + b, 0), y, {
        width: widths[index],
        height: 20,
        ellipsis: true,
      });
    });
    y += 18;
  }

  doc.y = y;
}

function createPdfBuffer(render: (doc: PDFKit.PDFDocument) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    render(doc);
    doc.end();
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = normalizeReportRange(url.searchParams.get("range"));
  const report = await getCallBoostReport(range);
  const pdf = await createPdfBuffer((doc) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#0f172a")
      .text("CallBoost Outreach Report");
    doc
      .moveDown(0.4)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#475569")
      .text(
        `${report.rangeLabel} | ${formatDate(report.startDate)} to ${formatDate(
          report.endDate
        )}`
      );

    drawHeading(doc, "KPI summary");
    const kpiRows = [
      ["Leads contacted today", report.kpis.leadsContactedToday],
      ["Total leads contacted", report.kpis.totalLeadsContacted],
      ["Total outbound SMS", report.kpis.totalOutboundSms],
      ["Total outbound emails", report.kpis.totalOutboundEmails],
      ["Total inbound replies", report.kpis.totalInboundReplies],
      ["STOP replies", report.kpis.stopReplies],
      ["Interested replies", report.kpis.interestedReplies],
      ["Not interested replies", report.kpis.notInterestedReplies],
      ["Contact-to-reply rate", formatPercent(report.kpis.contactToReplyRate)],
      [
        "Contact-to-interest rate",
        formatPercent(report.kpis.contactToInterestRate),
      ],
      ["STOP rate", formatPercent(report.kpis.stopRate)],
      ["Clients won", report.kpis.clientsWon],
    ];
    kpiRows.forEach(([label, value]) => drawKeyValue(doc, String(label), value));

    drawHeading(doc, "Daily activity");
    drawTable(
      doc,
      ["Date", "Contacted", "Replies", "Interested", "STOP"],
      report.dailyActivity.map((row) => [
        row.date,
        row.contacted,
        row.replies,
        row.interested,
        row.stops,
      ]),
      [110, 80, 80, 80, 60]
    );

    drawHeading(doc, "Channel performance");
    drawTable(
      doc,
      ["Channel", "Outbound", "Replies", "Interested", "Reply rate", "Interest rate"],
      report.channelPerformance.map((row) => [
        row.channel.toUpperCase(),
        row.outbound,
        row.replies,
        row.interested,
        formatPercent(row.replyRate),
        formatPercent(row.interestRate),
      ]),
      [70, 70, 70, 80, 80, 90]
    );

    drawHeading(doc, "Recent interested replies");
    drawTable(
      doc,
      ["Business", "City", "Trade", "Reply", "Received"],
      report.recentInterestedReplies.map((reply) => [
        reply.businessName,
        reply.city || "-",
        reply.trade || "-",
        reply.snippet,
        formatDate(reply.receivedAt),
      ]),
      [110, 65, 65, 180, 100]
    );
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="callboost-report-${range}.pdf"`,
    },
  });
}
