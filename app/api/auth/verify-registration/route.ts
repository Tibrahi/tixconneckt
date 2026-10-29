import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { createSessionForUser } from "@/lib/auth-session";
import { activationEmail, sendEmail } from "@/lib/email";
import { verifyOtp } from "@/lib/otp";
import { otpVerifySchema } from "@/lib/validation";

/** Activate an account after successful registration OTP verification. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success || parsed.data.purpose !== "register") {
    return apiError("Enter the 6-digit code sent to your email.", 400);
  }
  const { email, code } = parsed.data;

  const result = await verifyOtp(email, code, "register");
  if (!result.ok) {
    return apiError(result.error ?? "Verification failed.", 400);
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (rows.length === 0) {
    return apiError("Account not found. Please register again.", 404);
  }
  const user = rows[0];
  await db
    .update(users)
    .set({ status: "active", emailVerified: true })
    .where(eq(users.id, user.id));

  await createSessionForUser(user.id, {
    ipAddress: clientIp(req) ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  const { subject, text } = activationEmail(user.name);
  await sendEmail({ to: email, subject, text });

  return apiOk({ activated: true });
}
