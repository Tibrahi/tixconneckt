import { cookies } from "next/headers";
import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { getConfig, isProduction } from "./config";

export const SESSION_COOKIE = "tixconneckt.session_token";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function sessionCookieName(): string {
  return isProduction() ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

/**
 * Create a persisted session and issue a signed, HttpOnly cookie.
 */
export async function createSessionForUser(
  userId: string,
  opts: { ipAddress?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const secret = getConfig().AUTH_SECRET;
  await db.insert(sessions).values({
    token,
    userId,
    expiresAt,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent?.slice(0, 500),
  });
  const store = await cookies();
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  store.set(sessionCookieName(), `${token}.${signature}`, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
  });
  return { token, expiresAt };
}

/** Revoke every session belonging to a user (used after password change). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Clear the session cookie (used alongside server-side revocation). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}
