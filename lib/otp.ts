import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { otpChallenges } from "@/db/schema";
import { otpEmail, sendEmail } from "./email";
import { rateLimit } from "./rate-limit";

export type OtpPurpose = "register" | "login" | "recovery";

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function compareHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface OtpIssueResult {
  ok: boolean;
  error?: string;
  cooldownSeconds?: number;
  emailPending?: boolean;
}

/** Issue a new expiring OTP challenge with resend cooldown + rate limits. */
export async function issueOtp(
  email: string,
  purpose: OtpPurpose,
  userId?: string,
): Promise<OtpIssueResult> {
  const normalized = email.trim().toLowerCase();
  const rl = await rateLimit(`otp:${purpose}`, normalized, 5, "10 m");
  if (!rl.allowed) {
    return { ok: false, error: "Too many requests. Please try again later." };
  }

  const db = getDb();
  const recent = await db
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.email, normalized),
        eq(otpChallenges.purpose, purpose),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (recent.length > 0) {
    const ageSeconds = (Date.now() - recent[0].createdAt.getTime()) / 1000;
    if (ageSeconds < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: "A code was sent recently. Please wait before requesting another.",
        cooldownSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - ageSeconds),
      };
    }
  }

  const code = String(randomInt(100000, 1000000));
  await db.insert(otpChallenges).values({
    email: normalized,
    userId,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    maxAttempts: String(MAX_ATTEMPTS),
  });

  const { subject, text } = otpEmail(code, purpose);
  const result = await sendEmail({ to: normalized, subject, text });
  return { ok: true, emailPending: !result.sent };
}

export interface OtpVerifyResult {
  ok: boolean;
  error?: string;
  attemptsLeft?: number;
}

/** Validate an OTP code on the server with expiration + attempt limits. */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<OtpVerifyResult> {
  const normalized = email.trim().toLowerCase();
  const db = getDb();
  const rows = await db
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.email, normalized),
        eq(otpChallenges.purpose, purpose),
        isNull(otpChallenges.consumedAt),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: "No active verification code. Request a new one." };
  }
  const challenge = rows[0];
  if (challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This code has expired. Request a new one." };
  }
  const attempts = Number(challenge.attempts);
  const maxAttempts = Number(challenge.maxAttempts);
  if (attempts >= maxAttempts) {
    return { ok: false, error: "Too many attempts. Request a new code.", attemptsLeft: 0 };
  }
  if (!compareHash(hashCode(code.trim()), challenge.codeHash)) {
    await db
      .update(otpChallenges)
      .set({ attempts: String(attempts + 1) })
      .where(eq(otpChallenges.id, challenge.id));
    return {
      ok: false,
      error: "Incorrect code. Please try again.",
      attemptsLeft: maxAttempts - attempts - 1,
    };
  }
  await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(otpChallenges.id, challenge.id));
  return { ok: true };
}
