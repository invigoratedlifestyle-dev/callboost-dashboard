import { NextResponse } from "next/server";
import {
  getCityTargetForState,
  getStateTarget,
} from "../../../lib/leadTargeting/cities";
import { getTradeTarget } from "../../../lib/leadTargeting/trades";

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
  rejected: number;
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

export async function POST(req: Request) {
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

    const results: TownBatchResult[] = [];
    const origin = new URL(req.url).origin;

    for (const town of towns) {
      const cityTarget = getCityTargetForState(town, stateTarget.key);

      if (!cityTarget) {
        results.push({
          town,
          created: 0,
          skipped: 0,
          rejected: 0,
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

        const res = await fetch(`${origin}/api/leads/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stateKey: stateTarget.key,
            cityKey: cityTarget.key,
            tradeKey: tradeTarget.key,
            limit,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          results.push({
            town: cityTarget.city,
            created: 0,
            skipped: 0,
            rejected: 0,
            errors: [data.message || data.error || "Lead generation failed"],
          });
          continue;
        }

        const rejected = getNumber(data.skippedWrongTrade);
        const skipped =
          getNumber(data.existingSkipped) +
          getNumber(data.skippedDuplicates) +
          getNumber(data.skippedInvalidLocation) +
          getNumber(data.skippedInvalidPhone);

        results.push({
          town: cityTarget.city,
          created: getNumber(data.saved),
          skipped,
          rejected,
          errors: [],
        });
      } catch (error) {
        results.push({
          town: cityTarget.city,
          created: 0,
          skipped: 0,
          rejected: 0,
          errors: [
            error instanceof Error ? error.message : "Lead generation failed",
          ],
        });
      }
    }

    const totals = results.reduce(
      (summary, result) => {
        summary.created += result.created;
        summary.skipped += result.skipped;
        summary.rejected += result.rejected;
        summary.errors += result.errors.length;

        return summary;
      },
      {
        towns: results.length,
        created: 0,
        skipped: 0,
        rejected: 0,
        errors: 0,
      }
    );

    return NextResponse.json({
      success: true,
      state: stateTarget.key,
      trade: tradeTarget.key,
      limit,
      results,
      totals,
    });
  } catch (error) {
    console.error("Failed to generate lead batch:", error);

    return NextResponse.json(
      {
        error: "Lead generation batch failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
