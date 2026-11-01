import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentMethods } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { looksLikeCredential } from "@/lib/payment-methods";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { paymentMethodBindSchema } from "@/lib/validation";

/** My bound payment methods (readiness step — pending until verified). */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await db
    .select({
      id: paymentMethods.id,
      type: paymentMethods.type,
      displayLabel: paymentMethods.displayLabel,
      providerRef: paymentMethods.providerRef,
      status: paymentMethods.status,
      createdAt: paymentMethods.createdAt,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, session.user.id))
    .orderBy(desc(paymentMethods.createdAt))
    .limit(20);
  return apiOk({ methods: rows });
}

/**
 * Bind a payment method for later verification. Stores only the method
 * type, a masked display label, and an optional provider-issued reference.
 * Labels that look like full credentials are rejected. Every binding
 * starts `pending` — no provider integration is verified today, so nothing
 * activates here and TixlPay-dependent flows stay gated.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("payment-bind", session.user.id, 10, "1 h");
  if (!rl.allowed) return apiError("Too many attempts. Please try again later.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = paymentMethodBindSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid payment method.", 400);
  }
  if (looksLikeCredential(parsed.data.displayLabel)) {
    return apiError("Enter only a masked label (e.g. Visa •• 4242) — never a full card number.", 400);
  }

  const db = getDb();
  const existing = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, session.user.id))
    .limit(20);
  if (existing.length >= 20) {
    return apiError("You have reached the limit of 20 payment methods.", 400);
  }

  const [row] = await db
    .insert(paymentMethods)
    .values({
      userId: session.user.id,
      type: parsed.data.type,
      displayLabel: parsed.data.displayLabel,
      providerRef: parsed.data.providerRef || null,
      status: "pending",
    })
    .returning({ id: paymentMethods.id });
  return apiOk({ id: row.id, status: "pending" }, 201);
}
