import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions, createAuthToken } from "../../../lib/auth";

export async function POST(request: Request) {
  const adminPassword = process.env.CALLBOOST_ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      { error: "CALLBOOST_ADMIN_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (password !== adminPassword) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createAuthToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unable to create session" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);

  return response;
}
