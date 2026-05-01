import { NextResponse } from "next/server";
import OpenAI from "openai";
import { withLifecycleDefaults } from "../../lib/leadLifecycle";
import {
  buildGeneratedSiteHtml,
  saveGeneratedSite,
} from "../../lib/supabase/generatedSites";
import {
  getLeadRowBySlug,
  rowToLead,
  updateLeadBySlug,
} from "../../lib/supabase/leads";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export async function POST(req: Request) {
  try {
    const { slug } = await req.json();

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
    const prompt = `
Generate local business website content.

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
      description: ai.description,
      services: ai.services,
      reviews: hasGoogleReviews ? existingLead.reviews : ai.reviews,
      reviewsSource: hasGoogleReviews
        ? "google"
        : existingLead.reviewsSource || "none",
      generatedSiteUrl: publicUrl,
      aiGeneratedAt: new Date().toISOString(),
    });
    const html = buildGeneratedSiteHtml(updatedLead);
    const generatedSite = await saveGeneratedSite({
      leadId: leadRow.id || null,
      slug,
      html,
    });
    const savedLead = await updateLeadBySlug(slug, updatedLead);

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
