import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { securityEvents, sessions, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { createSessionForUser } from "@/lib/auth-session";
import { securityAlertEmail, sendEmail } from "@/lib/email";
import { verifyOtp } from "@/lib/otp";
import { otpVerifySchema } from "@/lib/validation";

/** Login step 2: verify OTP, then grant a session. Detects new devices. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success || parsed.data.purpose !== "login") {
    return apiError("Enter the 6-digit code sent to your email.", 400);
  }
  const { email, code } = parsed.data;

  const result = await verifyOtp(email, code, "login");
  if (!result.ok) {
    return apiError(result.error ?? "Verification failed.", 400);
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || user.status !== "active") {
    return apiError("This account is not active.", 403);
  }

  const userAgent = req.headers.get("user-agent") ?? "";
  const ip = clientIp(req);

  // New-device detection: compare against recent sessions.
  const recent = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.userAgent, userAgent)))
    .orderBy(desc(sessions.createdAt))
    .limit(5);
  const knownAgents = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), eq(sessions.userAgent, userAgent)))
    .limit(1);
  const isNewDevice = recent.length > 0 && knownAgents.length === 0;

  await createSessionForUser(user.id, { ipAddress: ip, userAgent });

  await db.insert(securityEvents).values({
    userId: user.id,
    type: isNewDevice ? "new_device" : "new_session",
    detail: isNewDevice ? `New device sign-in from ${ip ?? "unknown address"}` : "New session created",
    ipAddress: ip,
    userAgent,
  });

  if (isNewDevice) {
    const { subject, text } = securityAlertEmail(
      "New device sign-in",
      `A sign-in from an unrecognized device was detected${ip ? ` (${ip})` : ""}. If this was not you, change your password immediately.`,
    );
    await sendEmail({ to: user.email, subject, text });
  }

  return apiOk({ authenticated: true });
}
