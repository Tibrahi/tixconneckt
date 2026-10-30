import { verifyPassword } from "@/lib/password";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseUnavailable } from "@/db";
import { accounts, securityEvents, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { issueOtp } from "@/lib/otp";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

/**
 * Login step 1: validate credentials, then issue a login OTP.
 * No session is granted until the OTP is verified.
 */
export async function POST(req: Request) {
  try {
    return await login(req);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return apiError("Service temporarily unavailable. Please try again shortly.", 503);
  }
}

async function login(req: Request) {
  const rl = await rateLimit("login", clientIp(req) ?? "unknown", 10, "10 m");
  if (!rl.allowed) {
    return apiError("Too many login attempts. Please try again later.", 429, undefined, rateLimitHeaders(rl, 10));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Enter your email and password.", 400);
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, parsed.data.email.trim().toLowerCase())).limit(1);
  const user = rows[0];
  if (!user) {
    return apiError("Incorrect email or password.", 401);
  }
  if (user.status === "pending_verification") {
    return apiError("Your account is not activated yet. Check your email for the verification code.", 403);
  }
  if (user.status === "deactivated" || user.status === "deleted") {
    return apiError("This account is no longer active.", 403);
  }

  const creds = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
    .limit(1);
  const hash = creds[0]?.password;
  if (!hash || !(await verifyPassword({ hash, password: parsed.data.password }))) {
    await db.insert(securityEvents).values({
      userId: user.id,
      type: "failed_login",
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiError("Incorrect email or password.", 401);
  }

  const otp = await issueOtp(user.email, "login", user.id);
  if (!otp.ok) {
    return apiError(otp.error ?? "Could not send the login code.", 429);
  }
  return apiOk({ email: user.email, emailPending: otp.emailPending ?? false });
}
