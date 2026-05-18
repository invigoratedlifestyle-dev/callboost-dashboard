import { NextResponse } from "next/server";
import {
  getCityTargetForState,
  getStateTarget,
} from "../../../lib/leadTargeting/cities";
import { generateLeadsForTown } from "../../../lib/leadGeneration";
import { getTradeTarget } from "../../../lib/leadTargeting/trades";
import {
  createLeadGenerationRunSafe,
  updateLeadGenerationRunSafe,
} from "../../../lib/leadGenerationRuns";

type GenerateBatchRequest = {
  state?: string;
  stateKey?: string;
  towns?: string[];
  trade?: string;
  tradeKey?: string;
  limit?: number;
};

type TownBatchResult = {
  town: string;
  created: number;
  skipped: number;
  duplicatesSkipped: number;
  noOpportunitySkipped: number;
  enrichmentFailed: number;
  rejected: number;
  totalFound: number;
  success: boolean;
  status:
    | "created"
    | "no_results"
    | "duplicates"
    | "rejected"
    | "empty"
    | "failed";
  message: string;
  errors: string[];
};

function clampLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  const fallback = Number.isFinite(parsed) ? parsed : 50;

  return Math.max(1, Math.min(Math.floor(fallback), 200));
}

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getTownStatus(args: {
  created: number;
  skipped: number;
  rejected: number;
  totalFound: number;
  success: boolean;
}) {
  if (!args.success) return "failed";
  if (args.created > 0) return "created";
  if (args.totalFound === 0) return "no_results";
  if (args.skipped > 0 && args.rejected === 0) return "duplicates";
  if (args.rejected > 0 && args.skipped === 0) return "rejected";

  return "empty";
}

function getTownMessage(args: {
  trade: string;
  created: number;
  skipped: number;
  rejected: number;
  totalFound: number;
  status: TownBatchResult["status"];
  error?: string;
}) {
  if (args.status === "failed") {
    return `request failed${args.error ? ` (${args.error})` : ""}`;
  }

  if (args.status === "created") {
    return `${args.created} leads created`;
  }

  if (args.status === "no_results") {
    return `no matching ${args.trade} businesses found`;
  }

  if (args.status === "duplicates") {
    return "all results were duplicates";
  }

  if (args.status === "rejected") {
    return "all results rejected by trade validation";
  }

  if (args.skipped > 0 || args.rejected > 0) {
    return `${args.skipped} skipped, ${args.rejected} rejected`;
  }

  return `no matching ${args.trade} businesses found`;
}

function getAggregateMessage(args: {
  trade: string;
  created: number;
  skipped: number;
  rejected: number;
  totalFound: number;
  errors: number;
}) {
  if (args.created > 0) {
    return `${args.created} leads created, ${args.skipped} skipped, ${args.rejected} rejected.`;
  }

  if (args.errors > 0 && args.totalFound === 0) {
    return "No towns completed successfully.";
  }

  if (args.totalFound === 0) {
    return `No matching ${args.trade} businesses found.`;
  }

  if (args.skipped > 0 && args.rejected === 0) {
    return "All results were duplicates.";
  }

  if (args.rejected > 0 && args.skipped === 0) {
    return "All results failed trade validation.";
  }

  return `${args.skipped} skipped, ${args.rejected} rejected.`;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let runId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateBatchRequest;
    const stateKey = body.stateKey || body.state || "";
    const tradeKey = body.tradeKey || body.trade || "";
    const rawTowns = Array.isArray(body.towns) ? body.towns : [];
    const stateTarget = getStateTarget(stateKey);
    const tradeTarget = getTradeTarget(tradeKey);
    const limit = clampLimit(body.limit);

    if (!stateTarget) {
      return NextResponse.json(
        { error: "Invalid state target" },
        { status: 400 }
      );
    }

    if (!tradeTarget) {
      return NextResponse.json(
        { error: "Invalid trade target" },
        { status: 400 }
      );
    }

    const towns = Array.from(
      new Set(rawTowns.map((town) => String(town || "").trim()).filter(Boolean))
    );

    if (!towns.length) {
      return NextResponse.json(
        { error: "Select at least one town/suburb" },
        { status: 400 }
      );
    }

    const invalidTowns = towns.filter(
      (town) => !getCityTargetForState(town, stateTarget.key)
    );

    if (invalidTowns.length) {
      return NextResponse.json(
        {
          error: "Invalid town/suburb target",
          towns: invalidTowns,
        },
        { status: 400 }
      );
    }

    runId = await createLeadGenerationRunSafe({
      trade: tradeTarget.key,
      stateCode: stateTarget.key,
      towns,
      requestedLimit: limit,
      metadata: {
        mode: "batch",
        enrich: null,
      },
    });

    const results: TownBatchResult[] = [];

    for (const town of towns) {
      const cityTarget = getCityTargetForState(town, stateTarget.key);

      if (!cityTarget) {
        results.push({
          town,
          created: 0,
          skipped: 0,
          duplicatesSkipped: 0,
          noOpportunitySkipped: 0,
          enrichmentFailed: 0,
          rejected: 0,
          totalFound: 0,
          success: false,
          status: "failed",
          message: "request failed (Invalid town/suburb target)",
          errors: ["Invalid town/suburb target"],
        });
        continue;
      }

      try {
        console.log("[lead-generation-batch] generating town", {
          state: stateTarget.key,
          town: cityTarget.city,
          trade: tradeTarget.key,
          limit,
        });

        const data = await generateLeadsForTown({
          stateKey: stateTarget.key,
          cityKey: cityTarget.key,
          tradeKey: tradeTarget.key,
          limit,
        });

        const created = getNumber(data.created ?? data.saved);
        const rejected = getNumber(data.rejected ?? data.skippedWrongTrade);
        const duplicatesSkipped =
          getNumber(data.existingSkipped) + getNumber(data.skippedDuplicates);
        const noOpportunitySkipped = getNumber(data.skippedNoOpportunity);
        const enrichmentFailed = getNumber(data.enrichmentFailed);
        const skipped = getNumber(
          data.skipped ??
            duplicatesSkipped +
              getNumber(data.skippedInvalidLocation) +
              getNumber(data.skippedInvalidPhone) +
              noOpportunitySkipped
        );
        const totalFound = getNumber(data.totalFound ?? data.rawResults);
        const status = getTownStatus({
          created,
          skipped,
          rejected,
          totalFound,
          success: data.success !== false,
        });

        results.push({
          town: cityTarget.city,
          created,
          skipped,
          duplicatesSkipped,
          noOpportunitySkipped,
          enrichmentFailed,
          rejected,
          totalFound,
          success: data.success !== false,
          status,
          message:
            typeof data.message === "string" && data.message
              ? data.message
              : getTownMessage({
                  trade: tradeTarget.key,
                  created,
                  skipped,
                  rejected,
                  totalFound,
                  status,
                }),
          errors: [],
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Lead generation failed";

        console.error("[lead-generation-batch] town failed", {
          town: cityTarget.city,
          trade: tradeTarget.key,
          error: errorMessage,
        });

        results.push({
          town: cityTarget.city,
          created: 0,
          skipped: 0,
          duplicatesSkipped: 0,
          noOpportunitySkipped: 0,
          enrichmentFailed: 0,
          rejected: 0,
          totalFound: 0,
          success: false,
          status: "failed",
          message: getTownMessage({
            trade: tradeTarget.key,
            created: 0,
            skipped: 0,
            rejected: 0,
            totalFound: 0,
            status: "failed",
            error: errorMessage,
          }),
          errors: [errorMessage],
        });
      }
    }

    const totals = results.reduce(
      (summary, result) => {
        summary.created += result.created;
        summary.skipped += result.skipped;
        summary.duplicatesSkipped += result.duplicatesSkipped;
        summary.noOpportunitySkipped += result.noOpportunitySkipped;
        summary.rejected += result.rejected;
        summary.totalFound += result.totalFound;
        summary.errors += result.errors.length;

        return summary;
      },
      {
        towns: results.length,
        created: 0,
        skipped: 0,
        duplicatesSkipped: 0,
        noOpportunitySkipped: 0,
        rejected: 0,
        totalFound: 0,
        errors: 0,
      }
    );
    const message = getAggregateMessage({
      trade: tradeTarget.key,
      created: totals.created,
      skipped: totals.skipped,
      rejected: totals.rejected,
      totalFound: totals.totalFound,
      errors: totals.errors,
    });
    const status =
      totals.created > 0 && totals.errors > 0
        ? "partial"
        : totals.errors > 0
          ? "failed"
          : "completed";

    await updateLeadGenerationRunSafe(runId, {
      status,
      startedAt,
      leadsFound: totals.totalFound,
      leadsCreated: totals.created,
      duplicatesSkipped: totals.duplicatesSkipped,
      noOpportunitySkipped: totals.noOpportunitySkipped,
      enrichmentFailed: results.reduce(
        (sum, result) => sum + result.enrichmentFailed,
        0
      ),
      totalSkipped: totals.skipped,
      errorMessage:
        status === "failed"
          ? results.flatMap((result) => result.errors).join("; ") || message
          : null,
      metadata: {
        mode: "batch",
        townCount: towns.length,
        errors: totals.errors,
        rejected: totals.rejected,
      },
    });

    return NextResponse.json({
      success: true,
      state: stateTarget.key,
      trade: tradeTarget.key,
      limit,
      results,
      totals,
      message,
    });
  } catch (error) {
    console.error("Failed to generate lead batch:", error);
    await updateLeadGenerationRunSafe(runId, {
      status: "failed",
      startedAt,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Lead generation batch failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
