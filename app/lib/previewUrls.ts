export type PreviewUrlLead = {
  generatedSiteUrl?: string | null;
  id?: string | number | null;
  slug?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function buildCleanPreviewUrl(
  slug: string | number | null | undefined,
  explicitBaseUrl?: string | null
) {
  const leadKey = clean(slug);
  const baseUrl = getBaseUrl(explicitBaseUrl);

  return baseUrl && leadKey
    ? `${baseUrl}/preview/${encodeURIComponent(leadKey)}`
    : "";
}

export function buildCustomerPreviewUrl(
  lead: PreviewUrlLead,
  explicitBaseUrl?: string | null
) {
  const leadKey = clean(lead.slug) || clean(lead.id);

  return buildCleanPreviewUrl(leadKey, explicitBaseUrl);
}

export function getBrandedPreviewUrl(
  lead: PreviewUrlLead,
  explicitBaseUrl?: string | null
) {
  return buildCustomerPreviewUrl(lead, explicitBaseUrl);
}

export function replacePreviewUrlsWithCustomerUrl(args: {
  body: string;
  customerPreviewUrl?: string | null;
  previewUrls?: Array<string | null | undefined>;
}) {
  const customerPreviewUrl = clean(args.customerPreviewUrl);

  if (!customerPreviewUrl) return args.body;

  const previewUrls = [customerPreviewUrl, ...(args.previewUrls || [])]
    .map(clean)
    .filter(
      (url, index, urls): url is string =>
        Boolean(url) && urls.indexOf(url) === index
    );

  const normalizedBody = previewUrls.reduce(
    (body, previewUrl) => body.split(previewUrl).join(customerPreviewUrl),
    args.body
  );
  const customerUrlWithTrackingToken = new RegExp(
    `${escapeRegExp(customerPreviewUrl)}\\?t=[^\\s<]+`,
    "g"
  );

  return normalizedBody.replace(customerUrlWithTrackingToken, customerPreviewUrl);
}
