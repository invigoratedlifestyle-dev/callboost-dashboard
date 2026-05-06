import { NextResponse } from "next/server";
import { listNeedsFollowUp } from "../../../lib/supabase/followUpQueue";

export async function GET() {
  try {
    const needsFollowUp = await listNeedsFollowUp();

    return NextResponse.json({ needsFollowUp });
  } catch (error) {
    console.error("Failed to load follow-up queue:", error);

    return NextResponse.json(
      {
        error: "Failed to load follow-up queue",
        details: error instanceof Error ? error.message : "Unknown error",
        needsFollowUp: [],
      },
      { status: 500 }
    );
  }
}
