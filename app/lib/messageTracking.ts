import "server-only";

export function createTrackingToken() {
  return crypto.randomUUID();
}

export function createPublicTrackingToken() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getAppBaseUrl(requestUrl?: string) {
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "";

  if (configured) {
    return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  }

  if (requestUrl) {
    return new URL(requestUrl).origin;
  }

  return "";
}

export function buildTrackedPreviewUrl(args: {
  slug: string;
  publicTrackingToken?: string | null;
  appUrl: string;
  includeToken?: boolean;
}) {
  const cleanBaseUrl = args.appUrl.replace(/\/+$/, "");
  const cleanSlug = args.slug.trim();

  if (!cleanBaseUrl || !cleanSlug) return "";

  const publicTrackingToken = (args.publicTrackingToken || "").trim();
  const previewUrl = `${cleanBaseUrl}/preview/${encodeURIComponent(cleanSlug)}`;

  return args.includeToken !== false && publicTrackingToken
    ? `${previewUrl}?t=${encodeURIComponent(publicTrackingToken)}`
    : previewUrl;
}

export function buildOpenTrackingPixelUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/track/open/${encodeURIComponent(
    token
  )}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTrackedPreviewAnchor(args: {
  slug: string;
  publicTrackingToken?: string | null;
  appUrl: string;
  includeToken?: boolean;
  label?: string;
}) {
  const href = buildTrackedPreviewUrl(args);
  const label = args.label || "View your website preview";

  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : "";
}

export function textToTrackedHtml(
  text: string,
  openPixelUrl: string,
  options?: {
    previewTrackingUrl?: string | null;
    previewLinkLabel?: string;
  }
) {
  const previewTrackingUrl = (options?.previewTrackingUrl || "").trim();
  const previewLinkLabel =
    options?.previewLinkLabel || "View your website preview";
  const body = text
    .split(/(https?:\/\/[^\s<]+)/g)
    .map((part) => {
      if (!/^https?:\/\//i.test(part)) return escapeHtml(part);

      const href = escapeHtml(part);
      const label =
        previewTrackingUrl && part === previewTrackingUrl
          ? previewLinkLabel
          : part;

      return `<a href="${href}">${escapeHtml(label)}</a>`;
    })
    .join("")
    .replace(/\n/g, "<br />");

  return `${body}<img src="${escapeHtml(
    openPixelUrl
  )}" width="1" height="1" style="display:none" alt="" />`;
}

export function replacePreviewUrlWithTrackingUrl(args: {
  body: string;
  previewUrl?: string | null;
  previewUrls?: Array<string | null | undefined>;
  trackingUrl: string;
}) {
  const previewUrls = [
    args.previewUrl,
    ...(args.previewUrls || []),
  ]
    .map((url) => (url || "").trim())
    .filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

  if (!previewUrls.length) return args.body;

  const trackingPlaceholder = "__CALLBOOST_TRACKED_PREVIEW_URL__";
  const protectedBody = args.body.split(args.trackingUrl).join(trackingPlaceholder);
  const trackedBody = previewUrls.reduce(
    (body, previewUrl) => body.split(previewUrl).join(args.trackingUrl),
    protectedBody
  );

  return trackedBody.split(trackingPlaceholder).join(args.trackingUrl);
}
