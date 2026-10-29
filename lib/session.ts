import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
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
export async function getSession(): Promise<{
  user: SessionUser;
  session: { id: string; expiresAt: Date };
} | null> {
  try {
    const auth = getAuth();
    const data = await auth.api.getSession({ headers: await headers() });
    if (!data?.user || !data.session) return null;
    const u = data.user as unknown as Record<string, unknown>;
    return {
      user: {
        id: String(u.id),
        email: String(u.email),
        name: String(u.name ?? ""),
        shortId: String(u.shortId ?? ""),
        role: String(u.role ?? "user"),
        status: String(u.status ?? "active"),
        category: String(u.category ?? "individual"),
        emailVerified: Boolean(u.emailVerified),
      },
      session: {
        id: String((data.session as unknown as Record<string, unknown>).id),
        expiresAt: new Date(
          String((data.session as unknown as Record<string, unknown>).expiresAt),
        ),
      },
    };
  } catch {
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
