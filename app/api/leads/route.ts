import { NextResponse } from "next/server";
import {
  isLifecycleStatus,
  type LifecycleStatus,
} from "../../lib/leadLifecycle";
import { listLeads, listLeadsByStatus } from "../../lib/supabase/leads";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const leads =
      status && isLifecycleStatus(status)
        ? await listLeadsByStatus(status as LifecycleStatus)
        : await listLeads();

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
