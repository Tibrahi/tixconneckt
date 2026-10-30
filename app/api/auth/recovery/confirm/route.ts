import { hashPassword } from "@/lib/password";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { accounts, securityEvents, users, verifications } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { revokeAllUserSessions, clearSessionCookie } from "@/lib/auth-session";
import { passwordChangedEmail, sendEmail } from "@/lib/email";
import { verifyOtp } from "@/lib/otp";
import { signRecoveryToken, verifyRecoveryToken } from "@/lib/tokens";
import { passwordResetSchema } from "@/lib/validation";

const confirmSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^[0-9]{6}$/),
});

/**
 * Recovery step 2: verify the emailed code, then return a single-use signed
 * token authorizing the actual password change (the second verification step).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const step = url.searchParams.get("step") ?? "confirm";

  if (step === "confirm") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body.");
    }
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Enter the 6-digit code sent to your email.", 400);
    }
    const check = await verifyOtp(parsed.data.email, parsed.data.code, "recovery");
    if (!check.ok) {
      return apiError(check.error ?? "Verification failed.", 400);
    }
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (rows.length === 0) {
      return apiError("Account not found.", 404);
    }
    const token = await signRecoveryToken(rows[0].id, parsed.data.email);
    return apiOk({ token });
  }

  if (step === "reset") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body.");
    }
    const parsed = passwordResetSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Please correct the highlighted fields.", 400);
    }
    const verified = await verifyRecoveryToken(parsed.data.token);
    if (!verified) {
      return apiError("This recovery link has expired. Start again.", 400);
    }
    // Single-use enforcement: the OTP was consumed at confirm time, and we
    // record token use so replays are rejected.
    const db = getDb();
    const tokenId = `recovery-use:${parsed.data.token.slice(-32)}`;
    const used = await db
      .select({ id: verifications.id })
      .from(verifications)
      .where(and(eq(verifications.identifier, tokenId)))
      .limit(1);
    if (used.length > 0) {
      return apiError("This recovery link was already used. Start again.", 400);
    }

    // Re-confirm the code knowledge is fresh: require the code again is already
    // validated by token issuance; here we finalize the password change.
    const userRows = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);
    if (userRows.length === 0 || userRows[0].status !== "active") {
      return apiError("Account is not active.", 403);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await db
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, verified.userId), eq(accounts.providerId, "credential")));
    await db.insert(verifications).values({
      identifier: tokenId,
      value: "consumed",
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });

    await revokeAllUserSessions(verified.userId);
    await clearSessionCookie();

    await db.insert(securityEvents).values({
      userId: verified.userId,
      type: "password_changed",
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    const { subject, text } = passwordChangedEmail(userRows[0].name);
    await sendEmail({ to: userRows[0].email, subject, text });

    return apiOk({ changed: true });
  }

  return apiError("Unknown recovery step.", 400);
}
