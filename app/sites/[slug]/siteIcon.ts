import "server-only";
import { isArchivedLead } from "../../lib/leadLifecycle";
import {
  type GeneratedSiteRow,
  getGeneratedSiteBySlug,
} from "../../lib/supabase/generatedSites";
import { getLeadById, getLeadBySlug } from "../../lib/supabase/leads";

export type GeneratedSiteContext = {
  generatedSite: GeneratedSiteRow | null;
  lead: Awaited<ReturnType<typeof getLeadBySlug>>;
  leadSource: "slug" | "lead_id" | "none";
};

export function isValidHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function appendUrlVersion(value: string, version: string) {
  if (!version) return value;

  try {
    const url = new URL(value);

    url.searchParams.set("v", version);
    return url.toString();
  } catch {
    const [withoutHash, hash = ""] = value.split("#", 2);
    const separator = withoutHash.includes("?") ? "&" : "?";
    const nextUrl = `${withoutHash}${separator}v=${encodeURIComponent(version)}`;

    return hash ? `${nextUrl}#${hash}` : nextUrl;
  }
}

export async function getGeneratedSiteContext(
  slug: string
): Promise<GeneratedSiteContext> {
  const generatedSite = await getGeneratedSiteBySlug(slug);
  let lead = await getLeadBySlug(slug);
  let leadSource: GeneratedSiteContext["leadSource"] = lead ? "slug" : "none";

  if (!lead && generatedSite?.lead_id) {
    lead = await getLeadById(generatedSite.lead_id);
    leadSource = lead ? "lead_id" : "none";
  }

  return { generatedSite, lead, leadSource };
}

export function getOuterSiteIconUrl({
  generatedSite,
  lead,
}: GeneratedSiteContext) {
  if (!lead || isArchivedLead(lead) || !isValidHttpUrl(lead.siteIconUrl)) {
    return "";
  }

  const version =
    String(lead.updatedAt || "").trim() ||
    String(generatedSite?.updated_at || "").trim() ||
    String(generatedSite?.created_at || "").trim();

  return appendUrlVersion(String(lead.siteIconUrl), version);
}

export async function getSiteIconResponse(slug: string) {
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return new Response("Not found", { status: 404 });
  }

  const context = await getGeneratedSiteContext(slug);
  const siteIconUrl = getOuterSiteIconUrl(context);

  if (!siteIconUrl) {
    return new Response("Not found", { status: 404 });
  }

  const iconResponse = await fetch(siteIconUrl, { cache: "no-store" });

  if (!iconResponse.ok) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = iconResponse.headers.get("content-type") || "image/png";
  const bytes = await iconResponse.arrayBuffer();

  return new Response(bytes, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": contentType,
    },
  });
}
