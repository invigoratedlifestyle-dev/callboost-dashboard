import { NextResponse } from "next/server";
import { getLeadEngagementSummary } from "../../lib/engagementPriority";
import { getLeadBySlug } from "../../lib/supabase/leads";
import { recordMessageClickByPublicToken } from "../../lib/supabase/leadMessages";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

function getPreviewDestination(slug: string) {
  return `/sites/${encodeURIComponent(slug)}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const fallback = new URL("/", req.url);

  try {
    const { slug } = await params;
    const cleanSlug = typeof slug === "string" ? slug.trim() : "";

    if (!cleanSlug) {
      return NextResponse.redirect(fallback, { headers: NO_STORE_HEADERS });
    }

    const url = new URL(req.url);
    const publicTrackingToken = (url.searchParams.get("t") || "").trim();

    if (publicTrackingToken) {
      const message = await recordMessageClickByPublicToken(
        publicTrackingToken,
        cleanSlug
      );

      if (message?.slug) {
        const lead = await getLeadBySlug(message.slug);

        if (lead) {
          await getLeadEngagementSummary(lead);
        }
      }
    }

    return NextResponse.redirect(new URL(getPreviewDestination(cleanSlug), req.url), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("PREVIEW_TRACKING_FAILED", error);

    return NextResponse.redirect(fallback, { headers: NO_STORE_HEADERS });
  }
}
