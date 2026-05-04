import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "./app/lib/auth";

function isMarketingDomain(host: string) {
  const hostname = host.split(":")[0];

  return hostname === "callboost.co" || hostname === "www.callboost.co";
}

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/leads" || pathname.startsWith("/leads/")) return true;
  if (pathname.startsWith("/api/auth/")) return false;
  if (pathname === "/api/callback") return false;
  if (pathname === "/api/sms") return false;
  if (pathname === "/api/email/inbound") return false;
  if (pathname === "/api/stripe/webhook") return false;

  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  if (isMarketingDomain(host)) {
    const url = request.nextUrl.clone();

    if (pathname === "/") {
      url.pathname = "/marketing";
      return NextResponse.rewrite(url);
    }

    if (
      pathname.startsWith("/dashboard") ||
      pathname === "/leads" ||
      pathname.startsWith("/leads/")
    ) {
      url.pathname = "/marketing";
      return NextResponse.rewrite(url);
    }
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const isAuthenticated = await verifyAuthToken(
    request.cookies.get(AUTH_COOKIE_NAME)?.value
  );

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);

  if (!pathname.startsWith("/api/")) {
    loginUrl.searchParams.set("next", pathname);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
