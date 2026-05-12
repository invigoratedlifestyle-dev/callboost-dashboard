import { NextResponse } from "next/server";
import {
  isLifecycleStage,
  type LifecycleStage,
} from "../../lib/leadLifecycle";
import { isLeadStatus, type LeadStatus } from "../../lib/leadWorkflow";
import {
  listLeads,
  listLeadsByStage,
  listLeadsByWorkflowStatus,
} from "../../lib/supabase/leads";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawStage =
      searchParams.get("stage")?.trim().toLowerCase() ||
      "";
    const rawStatus = searchParams.get("status")?.trim().toLowerCase() || "";
    const stage = rawStage === "leads" ? "lead" : rawStage;
    const status = rawStatus;
    let leads = await listLeads();

    if (stage && isLifecycleStage(stage)) {
      leads = await listLeadsByStage(stage as LifecycleStage);
    }

    if (status && isLeadStatus(status)) {
      const statusLeads = await listLeadsByWorkflowStatus(status as LeadStatus);
      const statusSlugs = new Set(statusLeads.map((lead) => String(lead.slug)));

      leads = leads.filter((lead) => statusSlugs.has(String(lead.slug)));
    }

    console.log("Lead stage filter:", stage || "all");
    console.log("Lead status filter:", status || "all");
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

