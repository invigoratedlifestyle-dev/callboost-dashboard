import { NextResponse } from "next/server";
import { rerunWebsiteOpportunity } from "../../../lib/enrichLead";

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

    let evaluated = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        await rerunWebsiteOpportunity(slug);
        evaluated += 1;
      } catch (error) {
        failed += 1;
        console.error("WEBSITE_EVALUATION_BULK_FAILED", {
          slug,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return NextResponse.json({ success: true, evaluated, failed });
  } catch (error) {
    console.error("WEBSITE_EVALUATION_BULK_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to evaluate selected lead websites",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
