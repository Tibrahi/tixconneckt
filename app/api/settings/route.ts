import { and, desc, eq, ne } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { getDb } from "@/db";
import { accounts, profiles, sessions, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { clearSessionCookie, revokeAllUserSessions } from "@/lib/auth-session";
import { passwordChangedEmail, sendEmail } from "@/lib/email";
import { getSession } from "@/lib/session";

/** My active sessions for review and revocation. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, session.user.id))
    .orderBy(desc(sessions.createdAt))
    .limit(20);
  return apiOk({
    currentSessionId: session.session.id,
    sessions: rows.map((r) => ({
      ...r,
      current: r.id === session.session.id,
      device: (r.userAgent ?? "Unknown device").slice(0, 80),
    })),
  });
}

const revokeSchema = z.object({ sessionId: z.string().min(1) });

/** Revoke one of my sessions. */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);
  const db = getDb();
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, parsed.data.sessionId), eq(sessions.userId, session.user.id)))
    .returning({ id: sessions.id });
  if (deleted.length === 0) return apiError("Session not found.", 404);
  if (parsed.data.sessionId === session.session.id) {
    await clearSessionCookie();
  }
  await audit({ actorId: session.user.id, action: "session.revoke", targetType: "session", targetId: parsed.data.sessionId });
  return apiOk({ revoked: true });
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: z.string().min(8).max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Change my password: verify current, revoke other sessions, notify. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) return apiError("Check your new password entries.", 400);

  const db = getDb();
  const [cred] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, session.user.id), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!cred?.password || !(await verifyPassword({ hash: cred.password, password: parsed.data.currentPassword }))) {
    return apiError("Your current password is incorrect.", 401);
  }
  await db
    .update(accounts)
    .set({ password: await hashPassword(parsed.data.password) })
    .where(eq(accounts.id, cred.id));

  // Revoke all other sessions; keep the current one.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, session.user.id), ne(sessions.id, session.session.id)));

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (user) {
    const { subject, text } = passwordChangedEmail(user.name);
    await sendEmail({ to: user.email, subject, text });
  }
  await audit({ actorId: session.user.id, action: "password.change", targetType: "user", targetId: session.user.id, ipAddress: clientIp(req) });
  return apiOk({ changed: true });
}

const dangerSchema = z.object({
  action: z.enum(["deactivate", "delete"]),
  password: z.string().min(1),
  confirmation: z.string().optional(),
});

/**
 * Deactivation (reversible, account hidden) vs deletion (anonymized PII;
 * financial, agreement, and audit records lawfully retained).
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = dangerSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const db = getDb();
  const [cred] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, session.user.id), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!cred?.password || !(await verifyPassword({ hash: cred.password, password: parsed.data.password }))) {
    return apiError("Your password is incorrect.", 401);
  }

  if (parsed.data.action === "deactivate") {
    await db
      .update(users)
      .set({ status: "deactivated", deactivatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    await revokeAllUserSessions(session.user.id);
    await clearSessionCookie();
    await audit({ actorId: session.user.id, action: "account.deactivate", targetType: "user", targetId: session.user.id, ipAddress: clientIp(req) });
    return apiOk({ deactivated: true });
  }

  if (parsed.data.confirmation !== "DELETE") {
    return apiError('Type DELETE to confirm permanent deletion.', 400);
  }
  const stamp = Date.now().toString(36);
  await db
    .update(users)
    .set({
      status: "deleted",
      name: "Deleted user",
      email: `deleted-${session.user.id.slice(0, 8)}-${stamp}@deleted.tixconneckt`,
      phone: null,
      country: null,
      image: null,
    })
    .where(eq(users.id, session.user.id));
  await db
    .update(profiles)
    .set({ bio: null, objectives: null, skills: [], strengths: [], fields: [], location: null, major: null })
    .where(eq(profiles.userId, session.user.id));
  await revokeAllUserSessions(session.user.id);
  await clearSessionCookie();
  await audit({ actorId: session.user.id, action: "account.delete", targetType: "user", targetId: session.user.id, ipAddress: clientIp(req) });
  return apiOk({ deleted: true });
}
