import { NextResponse } from "next/server";
import { enrichLead } from "../../../lib/enrichLead";

function getSlugList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((slug): slug is string => typeof slug === "string")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slugs = Array.from(new Set(getSlugList(body.slugs)));

    if (!slugs.length) {
      return NextResponse.json({ error: "Missing slugs" }, { status: 400 });
    }

    let enriched = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        await enrichLead(slug);
        enriched += 1;
      } catch (error) {
        failed += 1;
        console.error("ENRICH_SELECTED_FAILED", {
          slug,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return NextResponse.json({ success: true, enriched, failed });
  } catch (error) {
    console.error("ENRICH_SELECTED_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to enrich selected leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
