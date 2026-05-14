import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import {
  getImageBufferFromRequest,
  normalizeGeneratedImage,
} from "../../../lib/brandingImages";
import { getLeadBySlug } from "../../../lib/supabase/leads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;

  return fallback;
}

function getLeadName(lead: Record<string, unknown> | null, fallback: string) {
  return String(
    lead?.businessName || lead?.displayName || lead?.name || fallback
  ).trim();
}

function buildPrompt(args: {
  mode: string;
  lead: Record<string, unknown> | null;
  leadSlug: string;
  prompt: string;
  transparent: boolean;
}) {
  const leadName = getLeadName(args.lead, args.leadSlug || "local business");
  const trade = String(args.lead?.trade || "local trade").trim();
  const city = String(args.lead?.city || "local area").trim();
  const templateType = String(args.lead?.templateType || "")
    .trim()
    .toLowerCase();
  const heroImageLedGuidance =
    templateType === "hero-image-led"
      ? [
          "This lead uses the hero-image-led website template, so the hero artwork should carry the main above-the-fold message.",
          "Create a premium local business campaign hero with branded vehicle, signage, uniform or relevant trade visuals where suitable.",
          "If adding marketing text inside the image, keep it concise, legible and mobile-crop safe.",
          "Leave safe space for top navigation and avoid important text near the top-right phone CTA area or extreme edges.",
        ].join(" ")
      : "";

  if (args.mode === "mobile-hero") {
    return [
      `Create a premium mobile-first hero image for ${leadName}, a ${trade} business in ${city}.`,
      "Use portrait/mobile-first composition with 4:5 or 9:16 style framing.",
      "Keep the focal subject centered and mobile crop safe.",
      "If including text, use a short readable stacked headline and keep it away from extreme left/right edges.",
      "Leave safe space for top navigation and a bottom call-to-action button.",
      "Keep vehicle or business branding visible where suitable.",
      heroImageLedGuidance,
      args.prompt,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (args.mode === "hero") {
    return [
      "Clean this local trade business hero image.",
      templateType === "hero-image-led"
        ? "Preserve tasteful branded campaign-style text if it is intentional, readable and useful."
        : "Remove visible text, watermarks, contact numbers, labels, banners and overlays where present.",
      "Keep the photo natural and realistic. Do not distort the main subject.",
      templateType === "hero-image-led"
        ? "Desktop and mobile hero images may be separate assets; keep this desktop version cinematic and landscape-friendly."
        : "",
      heroImageLedGuidance,
      args.prompt,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (args.mode === "icon") {
    return [
      `Create a simple square favicon-style mark for ${leadName}, a ${trade} business in ${city}.`,
      args.prompt ||
        "Create a clean square favicon-style site icon based on this navigation branding. Use the same colours and visual style. Prefer a simple lettermark or symbol. Transparent background. No full business name text.",
      "No mockup, no border, no background.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Create clean professional navigation branding for ${leadName}, a ${trade} business in ${city}.`,
    "Transparent background. Horizontal layout. Premium local trade business style. Strong readable text.",
    "No mockup, no background, no border, no extra symbols unless tasteful.",
    args.transparent ? "Preserve transparent background." : "",
    args.prompt,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const mode = getString(formData.get("mode")) || "navigation-branding";
    const leadSlug = getString(formData.get("leadSlug"));
    const prompt = getString(formData.get("prompt"));
    const transparent = getBoolean(formData.get("transparent"), true);
    const cropWhitespace = getBoolean(formData.get("cropWhitespace"), true);
    const sourceImage = await getImageBufferFromRequest(formData);
    const lead = leadSlug ? await getLeadBySlug(leadSlug) : null;

    if (leadSlug && !lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    if (mode === "hero" && !sourceImage) {
      return NextResponse.json(
        { error: "Hero cleanup requires an uploaded image or image URL." },
        { status: 400 }
      );
    }

    const finalPrompt = buildPrompt({ mode, lead, leadSlug, prompt, transparent });
    const isHeroMode = mode === "hero" || mode === "mobile-hero";
    const outputFormat = transparent && !isHeroMode ? "png" : "webp";
    const square = mode === "icon";
    const imageSize = mode === "mobile-hero" ? "1024x1536" : "1536x1024";
    const imageResponse = sourceImage
      ? await openai.images.edit({
          model: "gpt-image-1",
          image: await toFile(sourceImage.bytes, sourceImage.fileName, {
            type: sourceImage.contentType,
          }),
          prompt: finalPrompt,
          background: transparent && !isHeroMode ? "transparent" : "auto",
          output_format: outputFormat,
          quality: "high",
          size: square ? "1024x1024" : imageSize,
        })
      : await openai.images.generate({
          model: "gpt-image-1",
          prompt: finalPrompt,
          background: transparent && !isHeroMode ? "transparent" : "auto",
          output_format: outputFormat,
          quality: "high",
          size: square ? "1024x1024" : imageSize,
        });
    const b64 = imageResponse.data?.[0]?.b64_json;

    if (!b64) {
      return NextResponse.json(
        { error: "OpenAI did not return image data." },
        { status: 502 }
      );
    }

    const processed = await normalizeGeneratedImage({
      buffer: Buffer.from(b64, "base64"),
      transparent: transparent && !isHeroMode,
      cropWhitespace,
      square,
    });

    return NextResponse.json({
      imageData: processed.dataUrl,
      contentType: processed.contentType,
      sizeBytes: processed.sizeBytes,
      prompt: finalPrompt,
    });
  } catch (error) {
    console.error("Branding image generation failed:", error);

    return NextResponse.json(
      {
        error: "Failed to generate branding image.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
