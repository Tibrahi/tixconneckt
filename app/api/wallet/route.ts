import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contributions,
  groupMembers,
  ledgerEntries,
  savingsGoals,
  wallets,
  withdrawals,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/** My wallets, my groups' wallets, entries, goals, contributions, withdrawals. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "individual";
  const db = getDb();
  const userId = session.user.id;

  const memberships = await db
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
  const myGroupIds = memberships.map((m) => m.groupId);
  const adminGroupIds = memberships.filter((m) => m.role === "admin").map((m) => m.groupId);

  if (scope === "individual") {
    const myWallets = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, "user"), eq(wallets.ownerId, userId)));
    const entries =
      myWallets.length > 0
        ? await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.walletId, myWallets.map((w) => w.id)))
            .orderBy(desc(ledgerEntries.createdAt))
            .limit(100)
        : [];
    return apiOk({ wallets: myWallets, entries });
  }

  if (scope === "group") {
    const groupId = url.searchParams.get("groupId");
    if (!groupId || !myGroupIds.includes(groupId)) {
      return apiOk({ groups: memberships, wallets: [], entries: [], goals: [], contributions: [], withdrawals: [], isAdmin: false });
    }
    const groupWallets = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, "group"), eq(wallets.ownerId, groupId)));
    const walletIds = groupWallets.map((w) => w.id);
    const entries =
      walletIds.length > 0
        ? await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.walletId, walletIds))
            .orderBy(desc(ledgerEntries.createdAt))
            .limit(100)
        : [];
    const goals = await db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.groupId, groupId))
      .limit(50);
    const contribs =
      walletIds.length > 0
        ? await db
            .select()
            .from(contributions)
            .where(inArray(contributions.walletId, walletIds))
            .orderBy(desc(contributions.createdAt))
            .limit(100)
        : [];
    const draws =
      walletIds.length > 0
        ? await db
            .select()
            .from(withdrawals)
            .where(inArray(withdrawals.walletId, walletIds))
            .orderBy(desc(withdrawals.createdAt))
            .limit(100)
        : [];
    return apiOk({
      groups: memberships,
      wallets: groupWallets,
      entries,
      goals,
      contributions: contribs,
      withdrawals: draws,
      isAdmin: adminGroupIds.includes(groupId),
    });
  }

  if (scope === "provider") {
    // Provider funding received by me or my groups.
    const ownerClauses = [
      and(eq(wallets.ownerType, "user"), eq(wallets.ownerId, userId)),
      ...(myGroupIds.length
        ? [and(eq(wallets.ownerType, "group"), inArray(wallets.ownerId, myGroupIds))]
        : []),
    ];
    const { or } = await import("drizzle-orm");
    const relevant = await db
      .select()
      .from(wallets)
      .where(or(...ownerClauses));
    const walletIds = relevant.map((w) => w.id);
    const entries =
      walletIds.length > 0
        ? await db
            .select()
            .from(ledgerEntries)
            .where(
              and(
                inArray(ledgerEntries.walletId, walletIds),
                eq(ledgerEntries.kind, "provider_funding"),
              ),
            )
            .orderBy(desc(ledgerEntries.createdAt))
            .limit(100)
        : [];
    return apiOk({ entries, wallets: relevant });
  }

  return apiError("Unknown scope.", 400);
}
