import { NextResponse } from "next/server";
import {
  generateLeadsForTown,
  type GenerateLeadsForTownArgs,
} from "../../lib/leadGeneration";

type LegacyGenerateRequest = GenerateLeadsForTownArgs & {
  query?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as LegacyGenerateRequest;
    const result = await generateLeadsForTown({
      trade: body.trade,
      tradeKey: body.tradeKey,
      city: body.city,
      cityKey: body.cityKey,
      state: body.state || "TAS",
      stateKey: body.stateKey,
      limit: body.limit,
      maxLeads: body.maxLeads,
      enrich: body.enrich,
    });

    return NextResponse.json({
      ...result,
      query: body.query || `${result.trade} in ${result.city} Tasmania Australia`,
      saved: result.leads,
    });
  } catch (error) {
    console.error("Failed to generate leads:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Invalid trade target" ||
      message === "Invalid Town/Suburb target"
        ? 400
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate leads",
        details: message,
      },
      { status }
    );
  }
}
