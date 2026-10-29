import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, legalConsents, legalDocuments, profiles, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { findCountry } from "@/lib/countries";
import { LEGAL_DOCUMENTS } from "@/lib/legal-content";
import { issueOtp } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateUniqueShortId } from "@/lib/short-id";
import { registerSchema } from "@/lib/validation";

/** Registration: validate, create pending account, record consent, send OTP. */
export async function POST(req: Request) {
  const rl = await rateLimit("register", clientIp(req) ?? "unknown", 10, "1 h");
  if (!rl.allowed) {
    return apiError("Too many registration attempts. Please try again later.", 429, undefined, rateLimitHeaders(rl, 10));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (details[key] ??= []).push(issue.message);
    }
    return apiError("Please correct the highlighted fields.", 400, details);
  }
  const input = parsed.data;

  const country = findCountry(input.country);
  const phone = country?.callingCode === input.countryCode
    ? normalizePhone(input.phone, country.cca2)
    : null;
  if (!phone?.valid) {
    return apiError("The phone number is not valid for the selected country.", 400, {
      phone: ["Enter a valid phone number for the selected calling code."],
    });
  }

  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length > 0) {
    // Do not reveal whether the email is registered; behave like a fresh send.
    await issueOtp(input.email, "register");
    return apiOk({ email: input.email, resent: true });
  }

  // Ensure current legal versions exist with one lookup and one bulk insert.
  const legalTypes = LEGAL_DOCUMENTS.map((doc) => doc.type);
  const existingDocs = await db
    .select({ type: legalDocuments.type, version: legalDocuments.version })
    .from(legalDocuments)
    .where(inArray(legalDocuments.type, legalTypes));
  const missingDocs = LEGAL_DOCUMENTS.filter(
    (doc) => !existingDocs.some((existingDoc) => existingDoc.type === doc.type && existingDoc.version === doc.version),
  );
  if (missingDocs.length > 0) {
    await db
      .insert(legalDocuments)
      .values(missingDocs.map((doc) => ({
        type: doc.type,
        version: doc.version,
        title: doc.title,
        body: doc.body,
      })))
      .onConflictDoNothing();
  }
  const currentDocs = await db
    .select()
    .from(legalDocuments)
    .where(inArray(legalDocuments.type, legalTypes));

  const [shortId, passwordHash] = await Promise.all([
    generateUniqueShortId(),
    hashPassword(input.password),
  ]);

  const inserted = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      emailVerified: false,
      shortId,
      phone: phone.e164,
      country: input.country,
      countryCode: input.countryCode,
      timezone: input.timezone ?? "UTC",
      category: input.category,
      role: input.category === "provider" ? "provider" : "user",
      status: "pending_verification",
    })
    .returning({ id: users.id });
  const userId = inserted[0].id;

  const consents = currentDocs
    .filter((currentDoc) => LEGAL_DOCUMENTS.some((doc) => doc.type === currentDoc.type && doc.version === currentDoc.version))
    .map((doc) => ({
      userId,
      documentId: doc.id,
      version: doc.version,
      ipAddress: clientIp(req),
    }));
  await Promise.all([
    db.insert(profiles).values({ userId }),
    db.insert(accounts).values({
      accountId: input.email,
      providerId: "credential",
      userId,
      password: passwordHash,
    }),
    ...(consents.length > 0 ? [db.insert(legalConsents).values(consents)] : []),
  ]);

  const otp = await issueOtp(input.email, "register", userId);
  if (!otp.ok) {
    return apiError(otp.error ?? "Could not send the verification code.", 429);
  }
  return apiOk({ email: input.email, emailPending: otp.emailPending ?? false }, 201);
}
