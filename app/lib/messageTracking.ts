import "server-only";

export function createTrackingToken() {
  return crypto.randomUUID();
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

export function textToTrackedHtml(text: string, openPixelUrl: string) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
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
