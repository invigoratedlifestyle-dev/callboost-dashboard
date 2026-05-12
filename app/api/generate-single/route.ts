import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isArchivedLead, withLifecycleDefaults } from "../../lib/leadLifecycle";
import {
  buildGeneratedSiteHtml,
  saveGeneratedSite,
} from "../../lib/supabase/generatedSites";
import {
  getLeadRowBySlug,
  rowToLead,
  touchLeadActivity,
  updateLeadBySlug,
  updateLeadStatus,
} from "../../lib/supabase/leads";
import { isValidTradeLead } from "../../lib/tradeValidation";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const templateTradeOptions = [
  "plumber",
  "plumbing-gas-fitting",
  "electrician",
  "builder",
  "cleaner",
  "landscaper",
  "roofer",
  "painter",
  "mechanic",
];

const templateTypeOptions = [
  "modern",
  "premium",
  "local",
  "emergency",
  "minimal",
  "corporate",
];

function extractJson(text: string) {
  const cleaned = text.trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/```json\s*([\s\S]*?)```/);

  if (match?.[1]) {
    return JSON.parse(match[1]);
  }

  const fallback = cleaned.match(/\{[\s\S]*\}/);

  if (fallback?.[0]) {
    return JSON.parse(fallback[0]);
  }

  throw new Error("AI response did not contain valid JSON");
}

function getPublicUrl(request: Request, slug: string) {
  const origin = new URL(request.url).origin;

  return `${origin}/sites/${slug}`;
}

function normalizeTemplateTrade(value: unknown, fallback: unknown) {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (templateTradeOptions.includes(normalized)) return normalized;
  if (
    normalized.includes("plumb") &&
    (normalized.includes("gas") || normalized.includes("fitting"))
  ) {
    return "plumbing-gas-fitting";
  }
  if (normalized.includes("plumb")) return "plumber";
  if (normalized.includes("electric")) return "electrician";
  if (normalized.includes("build")) return "builder";
  if (normalized.includes("clean")) return "cleaner";
  if (normalized.includes("landscap")) return "landscaper";
  if (normalized.includes("roof")) return "roofer";
  if (normalized.includes("paint")) return "painter";
  if (normalized.includes("mechanic")) return "mechanic";

  return "plumber";
}

function normalizeTemplateType(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return templateTypeOptions.includes(normalized) ? normalized : "modern";
}

function getStringField(record: Record<string, unknown>, field: string) {
  const value = record[field];

  return typeof value === "string" ? value : "";
}

function hasGooglePlaceCategorySignals(lead: Record<string, unknown>) {
  return (
    (Array.isArray(lead.types) && lead.types.length > 0) ||
    Boolean(getStringField(lead, "primaryType")) ||
    Boolean(getStringField(lead, "primary_type"))
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slug = typeof body.slug === "string" ? body.slug : "";

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    if (!/^[a-z0-9-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    console.log("Generate single requested:", { slug });

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const existingLead = rowToLead(leadRow);
    const requestLead =
      body.lead && typeof body.lead === "object"
        ? (body.lead as Record<string, unknown>)
        : {};

    if (isArchivedLead(existingLead)) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const templateTrade = normalizeTemplateTrade(
      body.templateTrade,
      existingLead.trade
    );
    const templateType = normalizeTemplateType(body.templateType);
    const tradeValidation = hasGooglePlaceCategorySignals(existingLead)
      ? isValidTradeLead(existingLead, templateTrade)
      : null;

    if (tradeValidation && !tradeValidation.isValid) {
      console.log("[lead-validation] rejected place", {
        name:
          getStringField(existingLead, "businessName") ||
          getStringField(existingLead, "name"),
        trade: templateTrade,
        primaryType:
          getStringField(existingLead, "primaryType") ||
          getStringField(existingLead, "primary_type"),
        types: Array.isArray(existingLead.types) ? existingLead.types : [],
        reason: tradeValidation.reason || "wrong_trade",
      });

      return NextResponse.json(
        {
          error:
            "This lead does not look like a match for the selected trade. Check the Google business category before generating a site.",
          details: tradeValidation.reason || "wrong_trade",
        },
        { status: 400 }
      );
    }

    const prompt = `
Generate local business website content.

Selected template trade: ${templateTrade}

If the selected template trade is plumbing-gas-fitting / Plumbing and Gas Fitting, tailor the copy to licensed plumbing and gas fitting work. Mention safe, reliable gas work, emergency plumbing, hot water, gas appliance connections, residential work and light commercial support where suitable. Do not invent licence numbers or certifications.

Business:
${JSON.stringify(existingLead, null, 2)}

Return ONLY valid JSON:

{
  "description": "Short description",
  "services": ["Service 1", "Service 2"],
  "reviews": [
    { "name": "John", "rating": 5, "text": "Great service" }
  ]
}
`;

    const res = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate high-quality local business content. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const aiText = res.choices[0].message.content || "{}";
    const ai = extractJson(aiText);
    const hasGoogleReviews =
      existingLead.reviewsSource === "google" &&
      Array.isArray(existingLead.reviews) &&
      existingLead.reviews.length > 0;
    const publicUrl = getPublicUrl(req, slug);
    const updatedLead = withLifecycleDefaults({
      ...existingLead,
      siteBrandingUrl:
        getStringField(existingLead, "siteBrandingUrl") ||
        getStringField(requestLead, "siteBrandingUrl"),
      heroImageUrl:
        getStringField(existingLead, "heroImageUrl") ||
        getStringField(requestLead, "heroImageUrl"),
      siteIconUrl:
        getStringField(existingLead, "siteIconUrl") ||
        getStringField(requestLead, "siteIconUrl"),
      templateTrade,
      templateType,
      description: ai.description,
      services: ai.services,
      reviews: hasGoogleReviews ? existingLead.reviews : ai.reviews,
      reviewsSource: hasGoogleReviews
        ? "google"
        : existingLead.reviewsSource || "none",
      generatedSiteUrl: publicUrl,
      aiGeneratedAt: new Date().toISOString(),
    });

    console.log("GENERATE_SITE_ASSETS", {
      siteBrandingUrl: getStringField(updatedLead, "siteBrandingUrl"),
      heroImageUrl: getStringField(updatedLead, "heroImageUrl"),
      siteIconUrl: getStringField(updatedLead, "siteIconUrl"),
    });

    const html = await buildGeneratedSiteHtml(updatedLead);
    const siteIconUrl = getStringField(updatedLead, "siteIconUrl");

    console.log("GENERATE_SITE_ICON_DEBUG", {
      slug,
      siteIconUrl,
      htmlIncludesIcon: html.includes('rel="icon"'),
      htmlIncludesAppleIcon: html.includes('rel="apple-touch-icon"'),
    });

    const generatedSite = await saveGeneratedSite({
      leadId: leadRow.id || null,
      slug,
      html,
    });
    let savedLead = await updateLeadBySlug(slug, updatedLead);

    if (getStringField(savedLead, "generatedSiteUrl") && getStringField(savedLead, "siteBrandingUrl")) {
      savedLead = (await updateLeadStatus(slug, "ready_for_client")) || savedLead;
    } else {
      savedLead = (await touchLeadActivity(slug)) || savedLead;
    }

    console.log("GENERATED_SITE_STORED_ICON_DEBUG", {
      slug,
      siteIconUrl,
      storedHtmlIncludesIcon: generatedSite.html.includes('rel="icon"'),
      storedHtmlIncludesShortcutIcon: generatedSite.html.includes(
        'rel="shortcut icon"'
      ),
      storedHtmlIncludesAppleIcon: generatedSite.html.includes(
        'rel="apple-touch-icon"'
      ),
    });

    console.log("Generate single succeeded:", { slug, publicUrl });

    return NextResponse.json({
      success: true,
      lead: savedLead,
      generatedSite,
      publicUrl,
    });
  } catch (error) {
    console.error("Generate single failed:", error);

    return NextResponse.json(
      {
        error: "Failed to generate content",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
