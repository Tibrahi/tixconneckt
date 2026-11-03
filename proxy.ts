import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTES, requiresSessionCookie } from "@/lib/routes";

/**
 * Lightweight routing guard. Cookie presence only gates the redirect;
 * every protected page still validates the session server-side.
 * The dedicated admin auth pages stay public so the gate is reachable as-is.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!requiresSessionCookie(pathname)) return NextResponse.next();

  const hasSession = [
    "tixconneckt.session_token",
    "__Host-tixconneckt.session_token",
    // Accept existing sessions during the cookie-name transition.
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
  ].some((name) => req.cookies.has(name));
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = ROUTES.login;
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
