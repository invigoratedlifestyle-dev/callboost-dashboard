import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import OpenAI from "openai";
import {
  businessesDir,
  ensureBusinessesDir,
  withLifecycleDefaults,
} from "../../lib/leadLifecycle";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generatorRoot = path.join(process.cwd(), "..", "local-site-generator");

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

    ensureBusinessesDir();

    const filePath = path.join(businessesDir, `${slug}.json`);

    if (!fs.existsSync(filePath)) {
      console.error("❌ File not found:", filePath);

      return NextResponse.json(
        { error: "Lead JSON not found" },
        { status: 404 }
      );
    }

    const existingLead = JSON.parse(fs.readFileSync(filePath, "utf8"));

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

    const updatedLead = withLifecycleDefaults({
      ...existingLead,
      description: ai.description,
      services: ai.services,
      reviews: hasGoogleReviews ? existingLead.reviews : ai.reviews,
      reviewsSource: hasGoogleReviews
        ? "google"
        : existingLead.reviewsSource || "none",
      aiGeneratedAt: new Date().toISOString(),
    });

    fs.writeFileSync(filePath, JSON.stringify(updatedLead, null, 2));

    const command = `node scripts/generate.js --slug ${slug}`;

    console.log("Generate single command:", command);

    execFileSync("node", ["scripts/generate.js", "--slug", slug], {
      cwd: generatorRoot,
      stdio: "inherit",
    });

    console.log("Generate single succeeded:", { slug });

    return NextResponse.json({
      success: true,
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Generate single failed:", error);

    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
