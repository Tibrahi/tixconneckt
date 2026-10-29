import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, payments, plans, subscriptions, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";

/** Plan catalog for my category plus my subscriptions and payment history. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const category =
    user?.category === "provider" ? "provider" : user?.category === "university" || user?.category === "government" ? "group" : "individual";

  const catalog = await db.select().from(plans).where(eq(plans.category, category));
  const mine = await db
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      groupId: subscriptions.groupId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      createdAt: subscriptions.createdAt,
      tier: plans.tier,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      benefits: plans.benefits,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, session.user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(20);

  const history = await db
    .select({
      id: payments.id,
      subscriptionId: payments.subscriptionId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
    .where(eq(subscriptions.userId, session.user.id))
    .orderBy(desc(payments.createdAt))
    .limit(50);

  return apiOk({ category, catalog, subscriptions: mine, payments: history });
}

const subscribeSchema = z.object({
  planId: z.string().min(1),
  groupId: z.string().min(1).optional(),
});

/**
 * Subscribe: creates a PENDING subscription + payment record. Access activates
 * only after a verified payment event or authorized admin action — never here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return apiError("Select a plan.", 400);

  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.id, parsed.data.planId)).limit(1);
  if (!plan || plan.active !== "true") return apiError("Plan not found.", 404);

  if (parsed.data.groupId) {
    const [admin] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, parsed.data.groupId),
          eq(groupMembers.userId, session.user.id),
          eq(groupMembers.role, "admin"),
        ),
      )
      .limit(1);
    if (!admin) return apiError("Only group admins can subscribe a group.", 403);
  }

  // Cancel previous pending/active subscriptions for the same scope (upgrade/downgrade path).
  const previous = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, session.user.id),
        parsed.data.groupId
          ? eq(subscriptions.groupId, parsed.data.groupId)
          : eq(subscriptions.status, "pending"),
      ),
    )
    .limit(10);
  for (const p of previous) {
    if (p.status === "pending" || p.status === "active") {
      await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, p.id));
    }
  }

  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: session.user.id,
      groupId: parsed.data.groupId,
      planId: plan.id,
      status: "pending",
    })
    .returning({ id: subscriptions.id });
  await db.insert(payments).values({
    subscriptionId: sub.id,
    amountMinor: plan.priceMinor,
    currency: plan.currency,
    provider: "manual",
    status: "pending",
  });

  await notify({
    userId: session.user.id,
    type: "subscription",
    title: "Subscription awaiting payment",
    body: `${plan.category} ${plan.tier} — complete payment to activate.`,
    resourceType: "subscription",
    resourceId: sub.id,
  });

  return apiOk({ subscriptionId: sub.id, status: "pending" }, 201);
}

const cancelSchema = z.object({ subscriptionId: z.string().min(1) });

/** Cancel my subscription. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);
  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, parsed.data.subscriptionId), eq(subscriptions.userId, session.user.id)),
    )
    .limit(1);
  if (!sub) return apiError("Subscription not found.", 404);
  await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, sub.id));
  await notify({
    userId: session.user.id,
    type: "subscription",
    title: "Subscription cancelled",
    resourceType: "subscription",
    resourceId: sub.id,
  });
  return apiOk({ cancelled: true });
}
