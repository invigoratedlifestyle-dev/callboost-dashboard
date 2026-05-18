import { NextResponse } from "next/server";
import { listRecentLeadGenerationRuns } from "../../../lib/leadGenerationRuns";

export async function GET() {
  try {
    const runs = await listRecentLeadGenerationRuns(20);

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Failed to load lead generation runs:", error);

    return NextResponse.json(
      {
        error: "Failed to load lead generation runs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
