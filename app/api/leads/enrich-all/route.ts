import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { enrichLead } from "../../../lib/enrichLead";
import { businessesDir } from "../../../lib/leadLifecycle";

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
  const status = typeof lead.status === "string" ? lead.status : "new";

  return status === "new" || status === "contacted";
}

export async function POST() {
  try {
    if (!fs.existsSync(businessesDir)) {
      return NextResponse.json({
        success: true,
        enrichedCount: 0,
        failedCount: 0,
      });
    }

    const files = fs
      .readdirSync(businessesDir)
      .filter((file) => file.endsWith(".json"));
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedArchivedCount = 0;

    for (const file of files) {
      const filePath = path.join(businessesDir, file);
      const slug = path.basename(file, ".json");

      try {
        const lead = JSON.parse(fs.readFileSync(filePath, "utf8"));

        if (!isActiveLead(lead)) {
          skippedArchivedCount += 1;
          console.log("Enrich active skipped inactive lead:", {
            slug,
            status: lead.status || "new",
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
      skippedArchivedCount,
    });
  } catch (error) {
    console.error("Failed to enrich active leads:", error);

    return NextResponse.json(
      { error: "Failed to enrich active leads" },
      { status: 500 }
    );
  }
}
