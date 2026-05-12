import { NextResponse } from "next/server";
import { getLeadStage } from "../../../lib/leadLifecycle";
import {
  getLeadBySlug,
  updateLeadStageBySlug,
} from "../../../lib/supabase/leads";

type BulkStage = "contacted" | "archived";

const allowedStages = new Set<BulkStage>(["contacted", "archived"]);

function isBulkStage(value: string): value is BulkStage {
  return allowedStages.has(value as BulkStage);
}

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
    const stage =
      typeof body.stage === "string"
        ? body.stage
        : typeof body.status === "string"
          ? body.status
          : "";

    if (!slugs.length) {
      return NextResponse.json({ error: "Missing slugs" }, { status: 400 });
    }

    if (!isBulkStage(stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    let updated = 0;
    let skippedClients = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        const lead = await getLeadBySlug(slug);

        if (!lead) {
          failed += 1;
          console.error("BULK_STAGE_LEAD_NOT_FOUND", { slug, stage });
          continue;
        }

        if (getLeadStage(lead) === "client") {
          skippedClients += 1;
          console.log("BULK_STAGE_SKIPPED_CLIENT", { slug, stage });
          continue;
        }

        const result = await updateLeadStageBySlug(slug, stage);

        if (!result) {
          failed += 1;
          console.error("BULK_STAGE_UPDATE_NOT_FOUND", { slug, stage });
          continue;
        }

        updated += 1;
      } catch (error) {
        failed += 1;
        console.error("BULK_STAGE_UPDATE_FAILED", {
          slug,
          stage,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      skippedClients,
      failed,
    });
  } catch (error) {
    console.error("BULK_STAGE_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to update selected leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

