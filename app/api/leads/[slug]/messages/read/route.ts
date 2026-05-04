import { NextResponse } from "next/server";
import { markLeadInboundMessagesRead } from "../../../../../lib/supabase/leadMessages";
import { getLeadRowBySlug } from "../../../../../lib/supabase/leads";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updated = await markLeadInboundMessagesRead({
      leadId: leadRow.id || null,
      slug,
    });

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("Failed to mark lead messages read:", error);

    return NextResponse.json(
      {
        error: "Failed to mark lead messages read",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
