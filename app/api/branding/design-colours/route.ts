import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  isArchivedLead,
  withLifecycleDefaults,
} from "../../../lib/leadLifecycle";
import {
  buildGeneratedSiteHtml,
  getGeneratedSiteBySlug,
  saveGeneratedSite,
} from "../../../lib/supabase/generatedSites";
import {
  getLeadRowBySlug,
  rowToLead,
  updateLeadBySlug,
} from "../../../lib/supabase/leads";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

const DEFAULT_BUTTON_COLOR = "#14b8a6";
const DEFAULT_FOOTER_BACKGROUND_COLOR = "#0b1220";

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(color: Rgb) {
  return `#${[color.r, color.g, color.b]
    .map((value) => clamp(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function luminance(color: Rgb) {
  const channels = [color.r, color.g, color.b].map((value) => {
    const normalized = value / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: Rgb, b: Rgb) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));

  return (lighter + 0.05) / (darker + 0.05);
}

function getButtonTextColor(buttonColor: string) {
  const rgb = hexToRgb(buttonColor);

  return contrastRatio(rgb, { r: 255, g: 255, b: 255 }) >=
    contrastRatio(rgb, { r: 0, g: 0, b: 0 })
    ? "#ffffff"
    : "#000000";
}

function getHsl(color: Rgb) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }

  return {
    h: Math.round(h * 60 + (h < 0 ? 360 : 0)),
    s,
    l,
  };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

function withLightness(color: Rgb, lightness: number, saturationAdjust = 1) {
  const hsl = getHsl(color);

  return hslToRgb(
    hsl.h,
    Math.max(0.16, Math.min(0.9, hsl.s * saturationAdjust)),
    lightness
  );
}

function isUsefulBrandPixel(color: Rgb, alpha: number) {
  if (alpha < 160) return false;

  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const hsl = getHsl(color);

  if (max > 235 && min > 218 && max - min < 28) return false;
  if (max < 35 && hsl.s < 0.22) return false;

  return hsl.s >= 0.18 || max - min > 45;
}

function getDominantLogoColor(pixels: Buffer) {
  const buckets = new Map<string, { color: Rgb; score: number; count: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const color = {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
    };
    const alpha = pixels[index + 3];

    if (!isUsefulBrandPixel(color, alpha)) continue;

    const hsl = getHsl(color);
    const key = `${Math.round(color.r / 24)}-${Math.round(color.g / 24)}-${Math.round(
      color.b / 24
    )}`;
    const existing = buckets.get(key);
    const score = (0.55 + hsl.s) * (1.15 - Math.abs(hsl.l - 0.48));

    if (existing) {
      existing.score += score;
      existing.count += 1;
    } else {
      buckets.set(key, { color, score, count: 1 });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);

  return ranked[0]?.color || hexToRgb(DEFAULT_BUTTON_COLOR);
}

async function extractDesignColours(imageUrl: string) {
  const response = await fetch(imageUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Navigation branding image could not be fetched.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const { data } = await sharp(buffer, { animated: false })
    .rotate()
    .resize(220, 220, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mainColor = getDominantLogoColor(data);
  const hsl = getHsl(mainColor);
  const buttonColor =
    hsl.l > 0.72 ? toHex(withLightness(mainColor, 0.36)) : toHex(mainColor);
  const buttonTextColor = getButtonTextColor(buttonColor);
  const heroAccentColor = toHex(withLightness(mainColor, hsl.l > 0.62 ? 0.44 : 0.7));
  const bodyAccentColor = toHex(withLightness(mainColor, 0.32));
  const serviceAreaCardColor = toHex(withLightness(mainColor, 0.2, 0.7));
  const footerBackgroundColor = toHex(withLightness(mainColor, 0.12, 0.75));

  return {
    buttonColor,
    buttonTextColor,
    heroAccentColor,
    bodyAccentColor,
    serviceAreaCardColor,
    footerBackgroundColor:
      footerBackgroundColor === "#000000"
        ? DEFAULT_FOOTER_BACKGROUND_COLOR
        : footerBackgroundColor,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slug = getString(body.leadSlug);

    if (!slug) {
      return NextResponse.json({ error: "Lead slug is required" }, { status: 400 });
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const existingLead = rowToLead(leadRow);

    if (isArchivedLead(existingLead)) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const siteBrandingUrl = getString(existingLead.siteBrandingUrl);

    if (!siteBrandingUrl) {
      return NextResponse.json(
        { error: "Add navigation branding first, then generate design colours." },
        { status: 400 }
      );
    }

    const palette = await extractDesignColours(siteBrandingUrl);
    const existingDesign = getRecord(existingLead.design);
    const existingGeneratedSiteDesign = getRecord(existingLead.generated_site_design);
    const updatedLead = withLifecycleDefaults({
      ...existingLead,
      design: {
        ...existingDesign,
        ...palette,
        accentTextColor: palette.bodyAccentColor,
      },
      generated_site_design: {
        ...existingGeneratedSiteDesign,
        button_color: palette.buttonColor,
        button_text_color: palette.buttonTextColor,
        accent_text_color: palette.bodyAccentColor,
        hero_accent_color: palette.heroAccentColor,
        body_accent_color: palette.bodyAccentColor,
        service_area_card_color: palette.serviceAreaCardColor,
        footer_background_color: palette.footerBackgroundColor,
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
      palette,
      lead: savedLead,
      generatedSite,
    });
  } catch (error) {
    console.error("Failed to generate design colours:", error);

    return NextResponse.json(
      {
        error: "Failed to generate design colours",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
