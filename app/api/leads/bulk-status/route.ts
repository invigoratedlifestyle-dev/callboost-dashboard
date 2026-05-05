import { NextResponse } from "next/server";
import {
  getLeadBySlug,
  updateLeadStatusBySlug,
} from "../../../lib/supabase/leads";

type BulkStatus = "contacted" | "archived";

const allowedStatuses = new Set<BulkStatus>(["contacted", "archived"]);

function isBulkStatus(value: string): value is BulkStatus {
  return allowedStatuses.has(value as BulkStatus);
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
    const status = typeof body.status === "string" ? body.status : "";

    if (!slugs.length) {
      return NextResponse.json({ error: "Missing slugs" }, { status: 400 });
    }

    if (!isBulkStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    let updated = 0;
    let skippedClients = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        const lead = await getLeadBySlug(slug);

        if (!lead) {
          failed += 1;
          console.error("BULK_STATUS_LEAD_NOT_FOUND", { slug, status });
          continue;
        }

        if (lead.status === "client") {
          skippedClients += 1;
          console.log("BULK_STATUS_SKIPPED_CLIENT", { slug, status });
          continue;
        }

        const result = await updateLeadStatusBySlug(slug, status);

        if (!result) {
          failed += 1;
          console.error("BULK_STATUS_UPDATE_NOT_FOUND", { slug, status });
          continue;
        }

        updated += 1;
      } catch (error) {
        failed += 1;
        console.error("BULK_STATUS_UPDATE_FAILED", {
          slug,
          status,
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
    console.error("BULK_STATUS_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to update selected leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
