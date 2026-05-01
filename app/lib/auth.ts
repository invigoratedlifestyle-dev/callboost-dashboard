export const AUTH_COOKIE_NAME = "callboost_auth";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret() {
  return (
    process.env.CALLBOOST_SESSION_SECRET ||
    process.env.CALLBOOST_ADMIN_PASSWORD ||
    ""
  );
}

function toBase64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function signPayload(payload: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return toBase64Url(signature);
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

export async function createAuthToken() {
  const issuedAt = Date.now().toString();
  const signature = await signPayload(issuedAt);

  if (!signature) {
    return "";
  }

  return `${issuedAt}.${signature}`;
}

export async function verifyAuthToken(token?: string | null) {
  if (!token) return false;

  const [issuedAt, signature] = token.split(".");

  if (!issuedAt || !signature) return false;

  const issuedAtMs = Number(issuedAt);

  if (!Number.isFinite(issuedAtMs)) return false;

  const expiresAt = issuedAtMs + SESSION_TTL_SECONDS * 1000;

  if (Date.now() > expiresAt) return false;

  const expectedSignature = await signPayload(issuedAt);

  if (!expectedSignature) return false;

  return constantTimeEqual(signature, expectedSignature);
}

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
