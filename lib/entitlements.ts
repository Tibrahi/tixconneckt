import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, plans, subscriptions } from "@/db/schema";

/** Active subscription tiers for a user (personal + group memberships). */
export async function activeTiers(userId: string): Promise<Array<{ category: string; tier: string }>> {
  const db = getDb();
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
  const groupIds = memberships.map((m) => m.groupId);

  const subs = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
        // personal or via my groups
        groupIds.length > 0
          ? (await import("drizzle-orm")).or(
              eq(subscriptions.userId, userId),
              inArray(subscriptions.groupId, groupIds),
            )
          : eq(subscriptions.userId, userId),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(20);

  if (subs.length === 0) return [];
  const rows = await db
    .select({ category: plans.category, tier: plans.tier })
    .from(plans)
    .where(inArray(plans.id, subs.map((s) => s.planId)));
  return rows;
}

/** Server-side entitlement check: Super grants private-project access. */
export async function hasSuperAccess(userId: string): Promise<boolean> {
  const tiers = await activeTiers(userId);
  return tiers.some((t) => t.tier === "super");
}

/** Any active paid subscription. */
export async function hasPaidAccess(userId: string): Promise<boolean> {
  const tiers = await activeTiers(userId);
  return tiers.length > 0;
}
