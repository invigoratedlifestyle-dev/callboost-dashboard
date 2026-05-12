import { NextResponse } from "next/server";
import {
  isLifecycleStage,
  type LifecycleStage,
} from "../../lib/leadLifecycle";
import { listLeads, listLeadsByStage } from "../../lib/supabase/leads";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawStage =
      searchParams.get("stage")?.trim().toLowerCase() ||
      searchParams.get("status")?.trim().toLowerCase() ||
      "";
    const stage = rawStage === "leads" ? "lead" : rawStage;
    const leads =
      stage && isLifecycleStage(stage)
        ? await listLeadsByStage(stage as LifecycleStage)
        : await listLeads();

    console.log("Lead stage filter:", stage || "all");
    console.log("Fetched leads count:", leads.length);

    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Failed to load leads:", error);

    return NextResponse.json(
      {
        error: "Failed to load leads",
        details: error instanceof Error ? error.message : "Unknown error",
        leads: [],
      },
      { status: 500 }
    );
  }
}

