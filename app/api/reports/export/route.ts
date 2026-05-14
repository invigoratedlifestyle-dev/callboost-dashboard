import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  formatPercent,
  getCallBoostReport,
  normalizeReportRange,
} from "../../../lib/reports";

export const runtime = "nodejs";

type PdfContext = {
  doc: PDFDocument;
  page: PDFPage;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  };
  y: number;
};

const pageSize: [number, number] = [595.28, 841.89];
const margin = 48;
const bottomMargin = 48;
const textColor = rgb(0.07, 0.09, 0.16);
const mutedColor = rgb(0.29, 0.33, 0.41);
const lineColor = rgb(0.82, 0.85, 0.9);

function formatDate(value: string | null) {
  if (!value) return "All time";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function addPage(ctx: PdfContext) {
  ctx.page = ctx.doc.addPage(pageSize);
  ctx.y = ctx.page.getHeight() - margin;
}

function ensureSpace(ctx: PdfContext, height: number) {
  if (ctx.y - height < bottomMargin) {
    addPage(ctx);
  }
}

function drawText(
  ctx: PdfContext,
  text: string,
  x: number,
  y: number,
  options: {
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
  } = {}
) {
  const size = options.size || 10;
  const font = options.bold ? ctx.fonts.bold : ctx.fonts.regular;
  const color = options.color || textColor;
  const content =
    options.maxWidth && font.widthOfTextAtSize(text, size) > options.maxWidth
      ? truncateText(font, text, size, options.maxWidth)
      : text;

  ctx.page.drawText(content, {
    x,
    y,
    size,
    font,
    color,
  });
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const suffix = "...";
  let output = text.replace(/\s+/g, " ").trim();

  while (
    output.length > 0 &&
    font.widthOfTextAtSize(`${output}${suffix}`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }

  return output ? `${output}${suffix}` : suffix;
}

function drawHeading(ctx: PdfContext, text: string) {
  ensureSpace(ctx, 42);
  ctx.y -= 26;
  drawText(ctx, text, margin, ctx.y, { size: 15, bold: true });
  ctx.y -= 12;
}

function drawKeyValue(ctx: PdfContext, label: string, value: string | number) {
  ensureSpace(ctx, 18);
  drawText(ctx, `${label}:`, margin, ctx.y, { size: 10, bold: true, color: mutedColor });
  drawText(ctx, String(value), margin + 190, ctx.y, { size: 10 });
  ctx.y -= 16;
}

function drawRule(ctx: PdfContext, y: number, width: number) {
  ctx.page.drawLine({
    start: { x: margin, y },
    end: { x: margin + width, y },
    thickness: 0.6,
    color: lineColor,
  });
}

function drawTable(
  ctx: PdfContext,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[]
) {
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const rowHeight = 18;

  function drawHeader() {
    ensureSpace(ctx, 36);
    let x = margin;

    headers.forEach((header, index) => {
      drawText(ctx, header, x, ctx.y, {
        size: 8,
        bold: true,
        maxWidth: widths[index] - 4,
      });
      x += widths[index];
    });
    ctx.y -= 8;
    drawRule(ctx, ctx.y, tableWidth);
    ctx.y -= 12;
  }

  drawHeader();

  if (!rows.length) {
    ensureSpace(ctx, rowHeight);
    drawText(ctx, "No data for this range.", margin, ctx.y, {
      size: 9,
      color: mutedColor,
    });
    ctx.y -= rowHeight;
    return;
  }

  for (const row of rows) {
    if (ctx.y - rowHeight < bottomMargin) {
      addPage(ctx);
      drawHeader();
    }

    let x = margin;

    row.forEach((cell, index) => {
      drawText(ctx, String(cell), x, ctx.y, {
        size: 8,
        color: mutedColor,
        maxWidth: widths[index] - 4,
      });
      x += widths[index];
    });
    ctx.y -= rowHeight;
  }
}

async function createReportPdf(range: ReturnType<typeof normalizeReportRange>) {
  const report = await getCallBoostReport(range);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: PdfContext = {
    doc,
    page: doc.addPage(pageSize),
    fonts: { regular, bold },
    y: pageSize[1] - margin,
  };

  drawText(ctx, "CallBoost Reports", margin, ctx.y, {
    size: 22,
    bold: true,
  });
  ctx.y -= 22;
  drawText(
    ctx,
    `${report.rangeLabel} | ${formatDate(report.startDate)} to ${formatDate(
      report.endDate
    )}`,
    margin,
    ctx.y,
    { size: 10, color: mutedColor }
  );

  drawHeading(ctx, "KPI summary");
  [
    ["Leads contacted today", report.kpis.leadsContactedToday],
    ["Total leads contacted", report.kpis.totalLeadsContacted],
    ["Total outbound SMS", report.kpis.totalOutboundSms],
    ["Total outbound emails", report.kpis.totalOutboundEmails],
    ["Total inbound replies", report.kpis.totalInboundReplies],
    ["STOP replies", report.kpis.stopReplies],
    ["Interested replies", report.kpis.interestedReplies],
    ["Not interested replies", report.kpis.notInterestedReplies],
    ["Contact-to-reply rate", formatPercent(report.kpis.contactToReplyRate)],
    ["Contact-to-interest rate", formatPercent(report.kpis.contactToInterestRate)],
    ["STOP rate", formatPercent(report.kpis.stopRate)],
    ["Clients won", report.kpis.clientsWon],
    ["Open rate", formatPercent(report.kpis.openRate)],
    ["Preview click rate", formatPercent(report.kpis.previewClickRate)],
    ["Total opens", report.kpis.totalOpens],
    ["Total preview clicks", report.kpis.totalPreviewClicks],
  ].forEach(([label, value]) => drawKeyValue(ctx, String(label), value));

  drawHeading(ctx, "Daily activity");
  drawTable(
    ctx,
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

  drawHeading(ctx, "Channel performance");
  drawTable(
    ctx,
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

  drawHeading(ctx, "Recent interested replies");
  drawTable(
    ctx,
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

  return doc.save();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = normalizeReportRange(url.searchParams.get("range"));
    const pdf = await createReportPdf(range);

    const body = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="callboost-report-${range}.pdf"`,
      },
    });
  } catch (error) {
    console.error("REPORT_EXPORT_ERROR", error);

    const message =
      process.env.NODE_ENV === "production"
        ? "Failed to export report"
        : error instanceof Error
          ? error.message
          : "Unknown error";

    return Response.json(
      {
        error: "Failed to export report",
        details: message,
      },
      { status: 500 }
    );
  }
}
