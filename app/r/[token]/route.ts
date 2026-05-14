import { NextResponse } from "next/server";
import { recordMessageClick } from "../../lib/supabase/leadMessages";
import { getLeadEngagementSummary } from "../../lib/engagementPriority";
import { getLeadBySlug } from "../../lib/supabase/leads";
import { getPreviewUrl } from "../../lib/previewUrls";

function safeRedirect(url: string, fallback: string) {
  if (!url) return fallback;

  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;

  return fallback;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const fallback = new URL("/", req.url);

  try {
    const { token } = await params;
    const message = token ? await recordMessageClick(token) : null;

    if (!message) {
      return NextResponse.redirect(fallback, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      });
    }

    const lead = message.slug ? await getLeadBySlug(message.slug) : null;
    if (lead) {
      await getLeadEngagementSummary(lead);
    }
    const previewUrl =
      message.previewUrl ||
      (lead ? getPreviewUrl(lead, new URL(req.url).origin) : "") ||
      (message.slug ? `/sites/${encodeURIComponent(message.slug)}` : "");
    const destination = safeRedirect(previewUrl, "/");

    return NextResponse.redirect(new URL(destination, req.url), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("CLICK_TRACKING_FAILED", error);

    return NextResponse.redirect(fallback, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  }
}
