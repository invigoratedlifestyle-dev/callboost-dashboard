import { NextResponse } from "next/server";
import { listLeads } from "../../lib/supabase/leads";

export async function GET() {
  try {
    const leads = await listLeads();

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
