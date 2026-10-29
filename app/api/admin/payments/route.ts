import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments, plans, subscriptions, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";

async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") return null;
  return session;
}

/** Pending payments awaiting verification. */
export async function GET(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 20;
  const db = getDb();
  const rows = await db
    .select({
      id: payments.id,
      subscriptionId: payments.subscriptionId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      provider: payments.provider,
      providerRef: payments.providerRef,
      status: payments.status,
      createdAt: payments.createdAt,
      userEmail: users.email,
      userName: users.name,
      tier: plans.tier,
      category: plans.category,
    })
    .from(payments)
    .innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(payments.status, "pending"))
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ n: count() }).from(payments).where(eq(payments.status, "pending"));
  return apiOk({ items: rows, page, pageSize, total: total?.n ?? 0 });
}

const verifySchema = z.object({
  paymentId: z.string().min(1),
  decision: z.enum(["verified", "failed"]),
  providerRef: z.string().max(200).optional(),
});

/**
 * Verify a payment (activates the subscription for 30 days) or mark it failed.
 * Paid access activates ONLY through this authorized action.
 */
export async function PATCH(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, parsed.data.paymentId), eq(payments.status, "pending")))
    .limit(1);
  if (!payment) return apiError("Payment not found or already processed.", 404);

  await db
    .update(payments)
    .set({
      status: parsed.data.decision,
      providerRef: parsed.data.providerRef,
      verifiedBy: session.user.id,
    })
    .where(eq(payments.id, payment.id));

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, payment.subscriptionId))
    .limit(1);

  if (parsed.data.decision === "verified" && sub) {
    await db
      .update(subscriptions)
      .set({
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
      })
      .where(eq(subscriptions.id, sub.id));
  } else if (sub) {
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, sub.id));
  }

  if (sub) {
    await notify({
      userId: sub.userId,
      type: "subscription",
      title:
        parsed.data.decision === "verified"
          ? "Subscription activated"
          : "Payment could not be verified",
      resourceType: "subscription",
      resourceId: sub.id,
    });
    await audit({
      actorId: session.user.id,
      action: "admin.payment.verify",
      targetType: "payment",
      targetId: payment.id,
      metadata: { decision: parsed.data.decision },
    });
  }
  return apiOk({ decided: parsed.data.decision });
}
