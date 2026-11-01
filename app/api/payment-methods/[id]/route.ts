import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentMethods } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

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
