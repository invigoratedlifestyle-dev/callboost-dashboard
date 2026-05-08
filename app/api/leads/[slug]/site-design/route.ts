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
const DEFAULT_BUTTON_TEXT_COLOR = "#ffffff";
const DEFAULT_ACCENT_TEXT_COLOR = "#0f766e";
const DEFAULT_HERO_ACCENT_COLOR = "#a7f3d0";
const DEFAULT_BODY_ACCENT_COLOR = "#0f766e";
const DEFAULT_SERVICE_AREA_CARD_COLOR = "#0f766e";
const DEFAULT_FOOTER_BACKGROUND_COLOR = "#0b1220";

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function pickHex(...values: unknown[]) {
  return values.find(isHexColor) as string | undefined;
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

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const existingLead = rowToLead(leadRow);
    const existingDesign = getRecord(existingLead.design);
    const existingGeneratedSiteDesign = getRecord(existingLead.generated_site_design);
    const legacyAccent = pickHex(
      body.accentTextColor,
      existingDesign.accentTextColor,
      existingGeneratedSiteDesign.accent_text_color,
      DEFAULT_ACCENT_TEXT_COLOR
    );
    const buttonColor = pickHex(
      body.buttonColor,
      existingDesign.buttonColor,
      existingGeneratedSiteDesign.button_color,
      DEFAULT_BUTTON_COLOR
    );
    const buttonTextColor = pickHex(
      body.buttonTextColor,
      existingDesign.buttonTextColor,
      existingGeneratedSiteDesign.button_text_color,
      DEFAULT_BUTTON_TEXT_COLOR
    );
    const heroAccentColor = pickHex(
      body.heroAccentColor,
      existingDesign.heroAccentColor,
      existingGeneratedSiteDesign.hero_accent_color,
      legacyAccent,
      DEFAULT_HERO_ACCENT_COLOR
    );
    const bodyAccentColor = pickHex(
      body.bodyAccentColor,
      existingDesign.bodyAccentColor,
      existingGeneratedSiteDesign.body_accent_color,
      legacyAccent,
      DEFAULT_BODY_ACCENT_COLOR
    );
    const serviceAreaCardColor = pickHex(
      body.serviceAreaCardColor,
      existingDesign.serviceAreaCardColor,
      existingGeneratedSiteDesign.service_area_card_color,
      DEFAULT_SERVICE_AREA_CARD_COLOR
    );
    const footerBackgroundColor = pickHex(
      body.footerBackgroundColor,
      existingDesign.footerBackgroundColor,
      existingGeneratedSiteDesign.footer_background_color,
      DEFAULT_FOOTER_BACKGROUND_COLOR
    );

    if (
      !buttonColor ||
      !buttonTextColor ||
      !heroAccentColor ||
      !bodyAccentColor ||
      !serviceAreaCardColor ||
      !footerBackgroundColor
    ) {
      return NextResponse.json(
        { error: "Design colours must be valid 6-digit hex colours." },
        { status: 400 }
      );
    }

    const updatedLead = withLifecycleDefaults({
      ...existingLead,
      design: {
        ...existingDesign,
        buttonColor,
        buttonTextColor,
        accentTextColor: bodyAccentColor,
        heroAccentColor,
        bodyAccentColor,
        serviceAreaCardColor,
        footerBackgroundColor,
      },
      generated_site_design: {
        ...existingGeneratedSiteDesign,
        button_color: buttonColor,
        button_text_color: buttonTextColor,
        accent_text_color: bodyAccentColor,
        hero_accent_color: heroAccentColor,
        body_accent_color: bodyAccentColor,
        service_area_card_color: serviceAreaCardColor,
        footer_background_color: footerBackgroundColor,
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
