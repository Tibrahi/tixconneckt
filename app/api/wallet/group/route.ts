import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contributions, groupMembers, savingsGoals, wallets, withdrawals } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { decideEntry, ensureWallet, goalProgress, recordPendingEntry } from "@/lib/wallet";

const contributeSchema = z.object({
  groupId: z.string().min(1),
  goalId: z.string().min(1).optional(),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3).default("USD"),
});

/** Member contributes to a group wallet (pending until admin approval). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = contributeSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid amount.", 400);

  const db = getDb();
  const membership = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, parsed.data.groupId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  if (membership.length === 0) return apiError("You are not a member of this group.", 403);

  if (parsed.data.goalId) {
    const [goal] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, parsed.data.goalId), eq(savingsGoals.groupId, parsed.data.groupId)))
      .limit(1);
    if (!goal) return apiError("Savings goal not found.", 404);
    if (goal.maxMinor !== null && parsed.data.amountMinor > goal.maxMinor) {
      return apiError("This contribution exceeds the goal's maximum.", 400);
    }
  }

  const wallet = await ensureWallet("group", parsed.data.groupId, parsed.data.currency);
  const entry = await recordPendingEntry({
    walletId: wallet.id,
    direction: "credit",
    amountMinor: parsed.data.amountMinor,
    currency: parsed.data.currency,
    kind: "contribution",
    createdBy: session.user.id,
  });
  const [contrib] = await db
    .insert(contributions)
    .values({
      goalId: parsed.data.goalId,
      walletId: wallet.id,
      contributorId: session.user.id,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      ledgerEntryId: entry.id,
      status: "pending",
    })
    .returning({ id: contributions.id });

  // Link entry back to the contribution for audit.
  await db
    .update((await import("@/db/schema")).ledgerEntries)
    .set({ relatedType: "contribution", relatedId: contrib.id })
    .where(eq((await import("@/db/schema")).ledgerEntries.id, entry.id));

  const admins = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, parsed.data.groupId), eq(groupMembers.role, "admin")));
  for (const admin of admins) {
    if (admin.userId === session.user.id) continue;
    await notify({
      userId: admin.userId,
      type: "wallet",
      title: "Contribution awaiting approval",
      body: `${session.user.name} contributed to the group wallet.`,
      resourceType: "wallet",
      resourceId: wallet.id,
    });
  }
  await emitToRoom(`group:${parsed.data.groupId}`, "wallet:updated", { kind: "contribution" });

  return apiOk({ contributionId: contrib.id, entryId: entry.id, reference: entry.reference }, 201);
}

const decideSchema = z.object({
  contributionId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2000).optional(),
});

/** Group admin approves a contribution; threshold notifications fire on goals. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);
  if (parsed.data.decision === "rejected" && !parsed.data.reason?.trim()) {
    return apiError("A reason is required when rejecting a contribution.", 400);
  }

  const db = getDb();
  const [contrib] = await db
    .select()
    .from(contributions)
    .where(eq(contributions.id, parsed.data.contributionId))
    .limit(1);
  if (!contrib || contrib.status !== "pending") {
    return apiError("Contribution not found or already processed.", 404);
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, contrib.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "group") return apiError("Group wallet not found.", 404);
  const [admin] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, wallet.ownerId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!admin) return apiError("Only group admins can approve contributions.", 403);

  try {
    const result = await decideEntry({
      entryId: contrib.ledgerEntryId!,
      decision: parsed.data.decision,
      actorId: session.user.id,
      reason: parsed.data.reason?.trim() || `Contribution ${parsed.data.decision} by group admin`,
    });
    await db
      .update(contributions)
      .set({ status: parsed.data.decision })
      .where(eq(contributions.id, contrib.id));

    await notify({
      userId: contrib.contributorId,
      type: "wallet",
      title: `Contribution ${parsed.data.decision}`,
      body:
        parsed.data.decision === "rejected" ? parsed.data.reason?.trim() : undefined,
      resourceType: "wallet",
      resourceId: wallet.id,
    });

    // Threshold check for targeted savings.
    if (parsed.data.decision === "approved" && contrib.goalId) {
      const progress = await goalProgress(contrib.goalId);
      if (progress?.reached) {
        const members = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, wallet.ownerId), eq(groupMembers.status, "active")));
        for (const m of members) {
          await notify({
            userId: m.userId,
            type: "wallet",
            title: `Savings goal reached: ${progress.goal.name}`,
            body: `Collected ${progress.collectedMinor / 100} ${progress.goal.currency}.`,
            resourceType: "wallet",
            resourceId: wallet.id,
          });
        }
      }
    }

    await audit({
      actorId: session.user.id,
      action: "wallet.contribution.decide",
      targetType: "contribution",
      targetId: contrib.id,
      ipAddress: clientIp(req),
    });
    await emitToRoom(`group:${wallet.ownerId}`, "wallet:updated", { kind: "contribution" });
    return apiOk(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not process this contribution.", 400);
  }
}

const withdrawSchema = z.object({
  groupId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3).default("USD"),
});

/** Member requests a withdrawal from the group wallet (admin approval required). */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid amount.", 400);

  const db = getDb();
  const membership = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, parsed.data.groupId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  if (membership.length === 0) return apiError("You are not a member of this group.", 403);

  const wallet = await ensureWallet("group", parsed.data.groupId, parsed.data.currency);
  // Withdrawals debit the GROUP wallet only — never another member's personal funds.
  if (wallet.balanceMinor < parsed.data.amountMinor) {
    return apiError("The group wallet balance is insufficient.", 400);
  }

  const entry = await recordPendingEntry({
    walletId: wallet.id,
    direction: "debit",
    amountMinor: parsed.data.amountMinor,
    currency: parsed.data.currency,
    kind: "withdrawal",
    createdBy: session.user.id,
  });
  const [draw] = await db
    .insert(withdrawals)
    .values({
      walletId: wallet.id,
      requesterId: session.user.id,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      ledgerEntryId: entry.id,
      status: "pending",
    })
    .returning({ id: withdrawals.id });

  const admins = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, parsed.data.groupId), eq(groupMembers.role, "admin")));
  for (const admin of admins) {
    await notify({
      userId: admin.userId,
      type: "wallet",
      title: "Withdrawal awaiting approval",
      body: `${session.user.name} requested a group withdrawal.`,
      resourceType: "wallet",
      resourceId: wallet.id,
    });
  }
  return apiOk({ withdrawalId: draw.id, entryId: entry.id, reference: entry.reference }, 201);
}
