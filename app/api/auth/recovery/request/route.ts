import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { securityEvents, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { securityAlertEmail, sendEmail } from "@/lib/email";
import { issueOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";
import { recoveryRequestSchema } from "@/lib/validation";

/**
 * Recovery step 1: always responds identically so responses never reveal
 * whether an email address has an account.
 */
export async function POST(req: Request) {
  const rl = await rateLimit("recovery", clientIp(req) ?? "unknown", 5, "1 h");
  if (!rl.allowed) {
    return apiError("Too many recovery attempts. Please try again later.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = recoveryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Enter a valid email address.", 400);
  }
  const email = parsed.data.email;

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  if (user && user.status === "active") {
    await db.insert(securityEvents).values({
      userId: user.id,
      type: "recovery_requested",
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    const { subject, text } = securityAlertEmail(
      "Password recovery requested",
      "A password recovery was requested for your account. If this was not you, ignore the verification code — your password stays unchanged.",
    );
    await sendEmail({ to: email, subject, text });
    await issueOtp(email, "recovery", user.id);
  }

  return apiOk({ sent: true });
}
