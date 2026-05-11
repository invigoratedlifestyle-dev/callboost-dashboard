import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isArchivedLead } from "../../lib/leadLifecycle";
import {
  getGeneratedSiteContext,
  getOuterSiteIconUrl,
} from "./siteIcon";
import FaviconRefresh from "./FaviconRefresh";

type GeneratedSitePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ debugIcon?: string | string[] }>;
};

export const dynamic = "force-dynamic";

function getMetadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBusinessTitle(lead: NonNullable<Awaited<ReturnType<typeof getGeneratedSiteContext>>["lead"]>) {
  return (
    getMetadataText(lead.displayName) ||
    getMetadataText(lead.businessName) ||
    getMetadataText(lead.name) ||
    "CallBoost"
  );
}

function getBusinessDescription(
  lead: NonNullable<Awaited<ReturnType<typeof getGeneratedSiteContext>>["lead"]>
) {
  const city =
    getMetadataText(lead.city) ||
    getMetadataText(lead.region) ||
    getMetadataText(lead.state) ||
    "Tasmania";
  const trade = getMetadataText(lead.trade) || "plumbing";

  return (
    getMetadataText(lead.description) ||
    `Trusted ${trade} services in ${city}`
  );
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
  const title = getBusinessTitle(context.lead);
  const description = getBusinessDescription(context.lead);
  const heroImageUrl = getMetadataText(context.lead.heroImageUrl);
  const images = heroImageUrl ? [{ url: heroImageUrl }] : undefined;

  console.log("SITES_METADATA_ICON_DEBUG", {
    slug,
    siteIconUrl,
    source: context.leadSource,
  });

  return {
    title,
    description,
    icons: {
      ...(siteIconUrl ? { icon: [{ url: siteIconUrl }] } : {}),
      ...(siteIconUrl ? { shortcut: [{ url: siteIconUrl }] } : {}),
      ...(siteIconUrl ? { apple: [{ url: siteIconUrl }] } : {}),
    },
    openGraph: {
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      title,
      description,
      ...(heroImageUrl ? { images: [heroImageUrl] } : {}),
    },
  };
}

export default async function GeneratedSitePage({
  params,
  searchParams,
}: GeneratedSitePageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    notFound();
  }

  const context = await getGeneratedSiteContext(slug);
  const { generatedSite, lead } = context;

  if (!lead || isArchivedLead(lead)) {
    notFound();
  }

  if (!generatedSite?.html) {
    notFound();
  }

  const siteIconUrl = getOuterSiteIconUrl(context);
  const resolvedIconPath = `/sites/${encodeURIComponent(slug)}/icon`;
  const resolvedAppleIconPath = `/sites/${encodeURIComponent(slug)}/apple-icon`;
  const showIconDebug =
    process.env.NODE_ENV === "development" || query.debugIcon === "1";
  const faviconRefreshRendered = Boolean(siteIconUrl);

  if (faviconRefreshRendered) {
    console.log("SITES_FAVICON_REFRESH_RENDERED", {
      slug,
      siteIconUrl,
    });
  }

  return (
    <>
      {siteIconUrl ? (
        <FaviconRefresh iconUrl={siteIconUrl} />
      ) : null}
      <main className="min-h-screen bg-white">
        {showIconDebug ? (
          <aside className="fixed left-4 top-4 z-50 max-w-xl rounded-xl border border-slate-300 bg-white/95 p-4 text-xs text-slate-900 shadow-2xl">
            <h1 className="mb-2 text-sm font-bold">Site Icon Debug</h1>
            <dl className="grid gap-2">
              <div>
                <dt className="font-bold">resolved siteIconUrl</dt>
                <dd className="break-all">{siteIconUrl || "none"}</dd>
              </div>
              <div>
                <dt className="font-bold">resolved icon route</dt>
                <dd className="break-all">{resolvedIconPath}</dd>
              </div>
              <div>
                <dt className="font-bold">resolved apple icon route</dt>
                <dd className="break-all">{resolvedAppleIconPath}</dd>
              </div>
              <div>
                <dt className="font-bold">generated metadata icon URL</dt>
                <dd className="break-all">{siteIconUrl || "none"}</dd>
              </div>
              <div>
                <dt className="font-bold">FaviconRefresh rendered</dt>
                <dd>{faviconRefreshRendered ? "yes" : "no"}</dd>
              </div>
            </dl>
          </aside>
        ) : null}
        <iframe
          title={`${String(lead.businessName || lead.name || slug)} website preview`}
          srcDoc={generatedSite.html}
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
          className="fixed inset-0 block h-dvh w-screen border-0"
        />
      </main>
    </>
  );
}
