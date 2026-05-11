import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isArchivedLead } from "../../lib/leadLifecycle";
import { getGeneratedSiteBySlug } from "../../lib/supabase/generatedSites";
import { getLeadBySlug } from "../../lib/supabase/leads";

type GeneratedSitePageProps = {
  params: Promise<{ slug: string }>;
};

function isValidHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: GeneratedSitePageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return {};
  }

  const lead = await getLeadBySlug(slug);

  if (!lead || isArchivedLead(lead) || !isValidHttpUrl(lead.siteIconUrl)) {
    return {};
  }

  const siteIconUrl = String(lead.siteIconUrl);

  return {
    icons: {
      icon: siteIconUrl,
      apple: siteIconUrl,
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

  const lead = await getLeadBySlug(slug);

  if (!lead || isArchivedLead(lead)) {
    notFound();
  }

  const generatedSite = await getGeneratedSiteBySlug(slug);

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
