import { and, eq } from "drizzle-orm";
import { dbFailureCode, getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { paymentMethods } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { paymentMethodBindSchema } from "@/lib/validation";
import { looksLikeCredential } from "@/lib/payment-methods";
import { buildDisplayLabel, methodOption, validateMethodDetails } from "@/lib/payment-method-fields";

type RouteContext = { params: Promise<{ id: string }> };

/** Remove one of my bound payment methods. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, session.user.id)))
    .limit(1);
  if (!row) return apiError("Payment method not found.", 404);
  await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
  return apiOk({ deleted: true });
}

/** Edit non-sensitive method details. A change returns the binding to pending. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid request body."); }
  const parsed = paymentMethodBindSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid payment method.", 400);
  let displayLabel = parsed.data.displayLabel;
  let methodOptionValue: string | null = null;
  let details: Record<string, unknown> = {};
  if (parsed.data.option) {
    const option = methodOption(parsed.data.option);
    if (!option || option.type !== parsed.data.type) {
      return apiError("That method option does not match its type.", 400);
    }
    const checked = validateMethodDetails(parsed.data.option, parsed.data.details);
    if (!checked.ok) return apiError(checked.errors[0] ?? "Invalid payment details.", 400);
    methodOptionValue = parsed.data.option;
    details = checked.normalized;
    displayLabel = buildDisplayLabel(parsed.data.option, checked.normalized);
  } else if (looksLikeCredential(displayLabel)) {
    return apiError("Enter only a masked label — never a full card number.", 400);
  }
  const { id } = await params;
  const db = getDb();
  let row;
  try {
    [row] = await withMigrationRetry(() => db.select({ id: paymentMethods.id }).from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, session.user.id))).limit(1));
  } catch (error) {
    console.error(`[payment-methods:edit-read] database query failed (${dbFailureCode(error)})`);
    return apiError("Payment method could not be loaded. Please try again.", 503);
  }
  if (!row) return apiError("Payment method not found.", 404);
  try {
    await withMigrationRetry(() => db.update(paymentMethods).set({ type: parsed.data.type, methodOption: methodOptionValue, details, displayLabel, providerRef: parsed.data.providerRef || null, status: "pending" }).where(eq(paymentMethods.id, id)));
  } catch (error) {
    console.error(`[payment-methods:edit-save] database write failed (${dbFailureCode(error)})`);
    return apiError("Payment method could not be saved. Please try again.", 503);
  }
  return apiOk({ updated: true, status: "pending", underConstruction: true });
}
