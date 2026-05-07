import { NextResponse } from "next/server";
import { withLifecycleDefaults } from "../../../../lib/leadLifecycle";
import {
  buildGeneratedSiteHtml,
  getGeneratedSiteBySlug,
  saveGeneratedSite,
} from "../../../../lib/supabase/generatedSites";
import {
  getLeadRowBySlug,
  rowToLead,
  updateLeadBySlug,
} from "../../../../lib/supabase/leads";

const DEFAULT_BUTTON_COLOR = "#14b8a6";
const DEFAULT_ACCENT_TEXT_COLOR = "#0f766e";

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    if (!slug) {
      return NextResponse.json({ error: "Lead slug is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const buttonColor = body.buttonColor || DEFAULT_BUTTON_COLOR;
    const accentTextColor = body.accentTextColor || DEFAULT_ACCENT_TEXT_COLOR;

    if (!isHexColor(buttonColor) || !isHexColor(accentTextColor)) {
      return NextResponse.json(
        { error: "Design colours must be valid 6-digit hex colours." },
        { status: 400 }
      );
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const existingLead = rowToLead(leadRow);
    const existingDesign =
      existingLead.design && typeof existingLead.design === "object"
        ? (existingLead.design as Record<string, unknown>)
        : {};
    const updatedLead = withLifecycleDefaults({
      ...existingLead,
      design: {
        ...existingDesign,
        buttonColor,
        accentTextColor,
      },
    });
    const savedLead = await updateLeadBySlug(slug, updatedLead);
    const existingSite = await getGeneratedSiteBySlug(slug);
    const generatedSite = existingSite
      ? await saveGeneratedSite({
          leadId: leadRow.id || null,
          slug,
          html: await buildGeneratedSiteHtml(savedLead),
        })
      : null;

    return NextResponse.json({
      ok: true,
      lead: savedLead,
      generatedSite,
    });
  } catch (error) {
    console.error("Failed to save generated site design:", error);

    return NextResponse.json(
      {
        error: "Failed to save generated site design",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
