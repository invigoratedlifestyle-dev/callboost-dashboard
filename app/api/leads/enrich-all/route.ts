import { NextResponse } from "next/server";
import { enrichLead } from "../../../lib/enrichLead";
import { listLeads } from "../../../lib/supabase/leads";

function isPlaceholderEmail(email?: string) {
  const normalizedEmail = email?.trim().toLowerCase() || "";

  if (!normalizedEmail) return false;

  return (
    normalizedEmail === "contact@example.com" ||
    normalizedEmail === "admin@example.com" ||
    normalizedEmail === "test@example.com" ||
    normalizedEmail.endsWith("@example.com")
  );
}

function needsEnrichment(lead: Record<string, unknown>) {
  const email = typeof lead.email === "string" ? lead.email : "";

  return (
    !lead.websiteEvaluation ||
    !lead.priority ||
    typeof lead.leadScore !== "number" ||
    !lead.websiteStatus ||
    !lead.website ||
    !email ||
    isPlaceholderEmail(email)
  );
}

function isActiveLead(lead: Record<string, unknown>) {
  const status = typeof lead.status === "string" ? lead.status : "lead";

  return status === "lead" || status === "contacted";
}

export async function POST() {
  try {
    const leads = await listLeads();
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedInactiveCount = 0;

    for (const lead of leads) {
      const slug =
        typeof lead.slug === "string"
          ? lead.slug
          : typeof lead.id === "string"
            ? lead.id
            : "";

      try {
        if (!slug) {
          failedCount += 1;
          continue;
        }

        if (!isActiveLead(lead)) {
          skippedInactiveCount += 1;
          console.log("Enrich active skipped inactive lead:", {
            slug,
            status: lead.status || "lead",
          });
          continue;
        }

        if (!needsEnrichment(lead)) {
          continue;
        }

        const result = await enrichLead(slug);
        enrichedCount += 1;

        console.log("Enrich active result:", {
          slug,
          success: result.success,
        });
      } catch (error) {
        failedCount += 1;

        console.error("Enrich active failed:", {
          slug,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      enrichedCount,
      failedCount,
      skippedInactiveCount,
    });
  } catch (error) {
    console.error("Failed to enrich active leads:", error);

    return NextResponse.json(
      {
        error: "Failed to enrich active leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
