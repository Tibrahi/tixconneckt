import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { paymentMethods } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { looksLikeCredential } from "@/lib/payment-methods";
import { buildDisplayLabel, methodOption, validateMethodDetails } from "@/lib/payment-method-fields";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { paymentMethodBindSchema } from "@/lib/validation";

/** My bound payment methods (readiness step — pending until verified). */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await withMigrationRetry(() =>
    db
      .select({
        id: paymentMethods.id,
        type: paymentMethods.type,
        methodOption: paymentMethods.methodOption,
        details: paymentMethods.details,
        displayLabel: paymentMethods.displayLabel,
        providerRef: paymentMethods.providerRef,
        status: paymentMethods.status,
        createdAt: paymentMethods.createdAt,
      })
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, session.user.id))
      .orderBy(desc(paymentMethods.createdAt))
      .limit(20),
  );
  return apiOk({ methods: rows });
}

/**
 * Bind a payment method for later verification. Legacy label-only bindings
 * stay valid; the listified flow sends `option` + `details`, which are
 * validated per rail (card last4/expiry, MoMo phone/account, wallet
 * address…) and stored as public details with a server-built label.
 * Secrets are rejected everywhere. Every binding starts `pending` — the
 * rails are under construction, so the owner is notified that these saved
 * details will be used to proceed to the next step once processing opens.
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

  let displayLabel = parsed.data.displayLabel;
  let methodOptionValue: string | null = null;
  let details: Record<string, unknown> = {};
  if (parsed.data.option) {
    const option = methodOption(parsed.data.option);
    if (!option || option.type !== parsed.data.type) {
      return apiError("That method option does not match its type.", 400);
    }
    const checked = validateMethodDetails(parsed.data.option, parsed.data.details);
    if (!checked.ok) {
      return apiError(checked.errors[0] ?? "Invalid payment details.", 400);
    }
    methodOptionValue = parsed.data.option;
    details = checked.normalized;
    displayLabel = buildDisplayLabel(parsed.data.option, checked.normalized);
  } else if (looksLikeCredential(displayLabel)) {
    return apiError("Enter only a masked label (e.g. Visa •• 4242) — never a full card number.", 400);
  }

  const db = getDb();
  const row = await withMigrationRetry(async () => {
    const existing = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, session.user.id))
      .limit(20);
    if (existing.length >= 20) return null;

    const [inserted] = await db
      .insert(paymentMethods)
      .values({
        userId: session.user.id,
        type: parsed.data.type,
        methodOption: methodOptionValue,
        details,
        displayLabel,
        providerRef: parsed.data.providerRef || null,
        status: "pending",
      })
      .returning({ id: paymentMethods.id });
    return inserted;
  });
  if (!row) return apiError("You have reached the limit of 20 payment methods.", 400);

  try {
    await notify({
      userId: session.user.id,
      type: "payment_method",
      title: "Payment method saved",
      body: "Payment processing is still under construction — these details are saved and will be used to proceed to the next step.",
      resourceType: "payment_method",
      resourceId: row.id,
    });
  } catch (error) {
    console.error("[payment-methods] saved but the notification failed:", error instanceof Error ? error.message : error);
  }

  return apiOk({ id: row.id, status: "pending", underConstruction: true }, 201);
}
