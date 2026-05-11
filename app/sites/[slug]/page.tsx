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
};

export const dynamic = "force-dynamic";

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

  console.log("SITES_METADATA_ICON_DEBUG", {
    slug,
    siteIconUrl,
    source: context.leadSource,
  });

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

  const context = await getGeneratedSiteContext(slug);
  const { generatedSite, lead } = context;

  if (!lead || isArchivedLead(lead)) {
    notFound();
  }

  if (!generatedSite?.html) {
    notFound();
  }

  const siteIconUrl = getOuterSiteIconUrl(context);

  return (
    <>
      {siteIconUrl ? (
        <FaviconRefresh iconUrl={siteIconUrl} />
      ) : null}
      <main className="min-h-screen bg-white">
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
