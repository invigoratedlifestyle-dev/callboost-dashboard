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

export function buildTrackingUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/+$/, "")}/r/${encodeURIComponent(token)}`;
}

export function buildPreviewTrackingUrl(
  baseUrl: string,
  slug: string,
  publicTrackingToken?: string | null
) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const previewUrl = `${cleanBaseUrl}/preview/${encodeURIComponent(slug)}`;

  return publicTrackingToken
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
  trackingUrl: string;
}) {
  const previewUrl = (args.previewUrl || "").trim();

  if (!previewUrl) return args.body;

  return args.body.split(previewUrl).join(args.trackingUrl);
}
