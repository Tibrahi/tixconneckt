import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentMethods } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { paymentMethodBindSchema } from "@/lib/validation";
import { looksLikeCredential } from "@/lib/payment-methods";

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
  if (looksLikeCredential(parsed.data.displayLabel)) return apiError("Enter only a masked label — never a full card number.", 400);
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select({ id: paymentMethods.id }).from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, session.user.id))).limit(1);
  if (!row) return apiError("Payment method not found.", 404);
  await db.update(paymentMethods).set({ type: parsed.data.type, displayLabel: parsed.data.displayLabel, providerRef: parsed.data.providerRef || null, status: "pending" }).where(eq(paymentMethods.id, id));
  return apiOk({ updated: true, status: "pending" });
}
