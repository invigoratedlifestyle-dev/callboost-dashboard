export type PreviewUrlLead = {
  generatedSiteUrl?: string | null;
  id?: string | number | null;
  slug?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBaseUrl(explicitBaseUrl?: string | null) {
  const explicit = clean(explicitBaseUrl).replace(/\/$/, "");

  if (explicit) return explicit;

  const configured = clean(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");

  if (configured) return configured;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function getPreviewUrl(
  lead: PreviewUrlLead,
  explicitBaseUrl?: string | null
) {
  const generatedSiteUrl = clean(lead.generatedSiteUrl);

  if (generatedSiteUrl) return generatedSiteUrl;

  const leadKey = clean(lead.slug) || clean(lead.id);
  const baseUrl = getBaseUrl(explicitBaseUrl);

  return baseUrl && leadKey ? `${baseUrl}/sites/${leadKey}` : "";
}
