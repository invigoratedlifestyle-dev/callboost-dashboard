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

  if (args.mode === "hero") {
    return [
      "Clean this local trade business hero image.",
      "Remove visible text, watermarks, contact numbers, labels, banners and overlays where present.",
      "Keep the photo natural and realistic. Do not distort the main subject.",
      args.prompt,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (args.mode === "icon") {
    return [
      `Create a simple square favicon-style mark for ${leadName}, a ${trade} business in ${city}.`,
      "Use the source branding style and colours if provided.",
      "Transparent background. Strong readable icon. No mockup, no border, no background.",
      args.prompt,
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
    const outputFormat = transparent && mode !== "hero" ? "png" : "webp";
    const square = mode === "icon";
    const imageResponse = sourceImage
      ? await openai.images.edit({
          model: "gpt-image-1",
          image: await toFile(sourceImage.bytes, sourceImage.fileName, {
            type: sourceImage.contentType,
          }),
          prompt: finalPrompt,
          background: transparent && mode !== "hero" ? "transparent" : "auto",
          output_format: outputFormat,
          quality: "high",
          size: square ? "1024x1024" : "1536x1024",
        })
      : await openai.images.generate({
          model: "gpt-image-1",
          prompt: finalPrompt,
          background: transparent ? "transparent" : "auto",
          output_format: outputFormat,
          quality: "high",
          size: "1536x1024",
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
      transparent: transparent && mode !== "hero",
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
