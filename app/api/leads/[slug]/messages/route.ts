import { NextResponse } from "next/server";
import { listCallbacksForLead } from "../../../../lib/supabase/callbacks";
import { listLeadMessages } from "../../../../lib/supabase/leadMessages";
import { getLeadRowBySlug } from "../../../../lib/supabase/leads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [messages, callbacks] = await Promise.all([
      listLeadMessages({
        leadId: leadRow.id || null,
        slug,
      }),
      listCallbacksForLead({
        leadId: leadRow.id || null,
        slug,
      }),
    ]);

    return NextResponse.json({ messages, callbacks });
  } catch (error) {
    console.error("Failed to load lead messages:", error);

    return NextResponse.json(
      {
        error: "Failed to load lead messages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
