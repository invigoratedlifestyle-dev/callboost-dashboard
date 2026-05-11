import { NextResponse } from "next/server";
import { isArchivedLead } from "../../lib/leadLifecycle";
import { getGeneratedSiteBySlug } from "../../lib/supabase/generatedSites";
import { getLeadBySlug } from "../../lib/supabase/leads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const lead = await getLeadBySlug(slug);

    if (!lead || isArchivedLead(lead)) {
      return NextResponse.json({ error: "Generated site not found" }, { status: 404 });
    }

    const generatedSite = await getGeneratedSiteBySlug(slug);

    if (!generatedSite?.html) {
      return NextResponse.json({ error: "Generated site not found" }, { status: 404 });
    }

    return new Response(generatedSite.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Failed to load generated site:", error);

    return NextResponse.json(
      {
        error: "Failed to load generated site",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
