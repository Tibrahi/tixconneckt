import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, isDatabaseUnavailable } from "@/db";
import { sessions, users } from "@/db/schema";
import { getConfig } from "./config";
import { LEGACY_SESSION_COOKIES, SESSION_COOKIE, sessionCookieName } from "./auth-session";
import { ROUTES } from "./routes";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  shortId: string;
  role: string;
  status: string;
  category: string;
  emailVerified: boolean;
}

/** Server-side session validation. Returns null when unauthenticated. */
export async function getSession(options: { throwOnDatabaseUnavailable?: boolean } = {}): Promise<{
  user: SessionUser;
  session: { id: string; expiresAt: Date };
} | null> {
  try {
    const store = await cookies();
    const cookie = [sessionCookieName(), SESSION_COOKIE, ...LEGACY_SESSION_COOKIES]
      .map((name) => store.get(name)?.value)
      .find(Boolean);
    if (!cookie) return null;
    const [token, suppliedSignature, ...extra] = cookie.split(".");
    if (!token || !suppliedSignature || extra.length > 0) return null;
    const expected = createHmac("sha256", getConfig().AUTH_SECRET).update(token).digest();
    const actual = Buffer.from(suppliedSignature, "base64");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const [row] = await getDb()
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        id: users.id,
        email: users.email,
        name: users.name,
        shortId: users.shortId,
        role: users.role,
        status: users.status,
        category: users.category,
        emailVerified: users.emailVerified,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!row) return null;
    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        shortId: row.shortId,
        role: row.role,
        status: row.status,
        category: row.category,
        emailVerified: row.emailVerified,
      },
      session: {
        id: row.sessionId,
        expiresAt: row.expiresAt,
      },
    };
  } catch (error) {
    if (options.throwOnDatabaseUnavailable && isDatabaseUnavailable(error)) throw error;
    return null;
  }
}

/** Require an authenticated, active user or redirect to login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(ROUTES.login);
  if (session.user.status === "deactivated" || session.user.status === "deleted") {
    redirect(ROUTES.login);
  }
  return session.user;
}

/** Require an administrator or redirect to the dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect(ROUTES.dashboard);
  return user;
}

export function isAdminRole(role: string): boolean {
  return role === "admin";
}
