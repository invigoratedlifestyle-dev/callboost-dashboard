import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isArchivedLead } from "../../lib/leadLifecycle";
import {
  type GeneratedSiteRow,
  getGeneratedSiteBySlug,
} from "../../lib/supabase/generatedSites";
import { getLeadById, getLeadBySlug } from "../../lib/supabase/leads";

type GeneratedSitePageProps = {
  params: Promise<{ slug: string }>;
};

type GeneratedSiteContext = {
  generatedSite: GeneratedSiteRow | null;
  lead: Awaited<ReturnType<typeof getLeadBySlug>>;
};

export const dynamic = "force-dynamic";

function isValidHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function appendUrlVersion(value: string, version: string) {
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

async function getGeneratedSiteContext(
  slug: string
): Promise<GeneratedSiteContext> {
  const generatedSite = await getGeneratedSiteBySlug(slug);
  let lead = await getLeadBySlug(slug);

  if (!lead && generatedSite?.lead_id) {
    lead = await getLeadById(generatedSite.lead_id);
  }

  return { generatedSite, lead };
}

function getOuterSiteIconUrl({
  generatedSite,
  lead,
}: GeneratedSiteContext) {
  if (!lead || !isValidHttpUrl(lead.siteIconUrl)) return "";

  const version =
    String(generatedSite?.updated_at || "").trim() ||
    String(lead.updatedAt || "").trim() ||
    String(generatedSite?.created_at || "").trim();

  return appendUrlVersion(String(lead.siteIconUrl), version);
}

export async function generateMetadata({
  params,
}: GeneratedSitePageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return {};
  }

  const context = await getGeneratedSiteContext(slug);

  if (!context.lead || isArchivedLead(context.lead)) return {};

  const siteIconUrl = getOuterSiteIconUrl(context);

  if (!siteIconUrl) return {};

  return {
    icons: {
      icon: [{ url: siteIconUrl }],
      shortcut: [{ url: siteIconUrl }],
      apple: [{ url: siteIconUrl }],
    },
  };
}

export default async function GeneratedSitePage({
  params,
}: GeneratedSitePageProps) {
  const { slug } = await params;

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    notFound();
  }

  const { generatedSite, lead } = await getGeneratedSiteContext(slug);

  if (!lead || isArchivedLead(lead)) {
    notFound();
  }

  if (!generatedSite?.html) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white">
      <iframe
        title={`${String(lead.businessName || lead.name || slug)} website preview`}
        srcDoc={generatedSite.html}
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        className="fixed inset-0 block h-dvh w-screen border-0"
      />
    </main>
  );
}
