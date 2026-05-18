import { NextResponse } from "next/server";
import {
  generateLeadsForTown,
  type GenerateLeadsForTownArgs,
} from "../../../lib/leadGeneration";
import {
  createLeadGenerationRunSafe,
  updateLeadGenerationRunSafe,
} from "../../../lib/leadGenerationRuns";

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getRequestedLimit(value: unknown) {
  const parsed = getNumber(value);

  return parsed > 0 ? Math.floor(parsed) : null;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let runId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateLeadsForTownArgs;
    const trade = String(body.tradeKey || body.trade || "").trim() || "unknown";
    const stateCode = String(body.stateKey || body.state || "").trim();
    const town = String(body.cityKey || body.city || body.town || "").trim();
    const requestedLimit = getRequestedLimit(body.limit ?? body.maxLeads);

    runId = await createLeadGenerationRunSafe({
      trade,
      stateCode,
      towns: town ? [town] : [],
      requestedLimit,
      metadata: {
        mode: "single",
        enrich: body.enrich ?? null,
      },
    });

    const result = await generateLeadsForTown(body);
    const leadsCreated = getNumber(result.created ?? result.saved);
    const enrichmentFailed = getNumber(result.enrichmentFailed);
    const status =
      leadsCreated > 0 && enrichmentFailed > 0
        ? "partial"
        : "completed";

    await updateLeadGenerationRunSafe(runId, {
      status,
      startedAt,
      leadsFound: getNumber(result.totalFound ?? result.rawResults),
      leadsCreated,
      duplicatesSkipped:
        getNumber(result.existingSkipped) + getNumber(result.skippedDuplicates),
      noOpportunitySkipped: getNumber(result.skippedNoOpportunity),
      enrichmentFailed,
      totalSkipped: getNumber(result.skipped),
      metadata: {
        mode: "single",
        queriesRun: result.queriesRun,
        rawResults: result.rawResults,
        dedupedResults: result.dedupedResults,
        rejected: result.rejected,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate leads:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    await updateLeadGenerationRunSafe(runId, {
      status: "failed",
      startedAt,
      errorMessage: message,
    });
    const status =
      message === "Invalid trade target" ||
      message === "Invalid Town/Suburb target"
        ? 400
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: "Lead generation failed",
        details: message,
      },
      { status }
    );
  }
}
