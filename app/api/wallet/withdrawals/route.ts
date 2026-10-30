import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, ledgerEntries, users, wallets, withdrawals } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { isSupportedCurrency, normalizeCurrency } from "@/lib/currency";
import { notify, notifyMember } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { rateLimit } from "@/lib/rate-limit";
import { getSession, isAdminRole } from "@/lib/session";
import { submitPayout } from "@/lib/tixlpay";
import { individualWithdrawalSchema } from "@/lib/validation";
import {
  availableBalance,
  decideEntry,
  getOrCreateMemberAccount,
  recordPendingEntry,
} from "@/lib/wallet";

/**
 * Member requests a withdrawal from their OWN wallet (wallet.md FR-08).
 *
 * Validates ownership, account status, minimum withdrawal, available funds
 * (balance minus pending reservations), and cooldowns. Funds are reserved by
 * a pending debit entry — the balance drops only when the provider confirms
 * the payout. Idempotent per idempotency key.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("withdrawal", session.user.id, 10, "1 h");
  if (!rl.allowed) return apiError("Too many withdrawal requests. Please try again later.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = individualWithdrawalSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid withdrawal amount.", 400);

  const currency = normalizeCurrency(parsed.data.currency);
  if (!isSupportedCurrency(currency)) {
    return apiError(`Currency ${currency} is not supported.`, 400);
  }

  const db = getDb();
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.ownerType, "user"),
        eq(wallets.ownerId, session.user.id),
        eq(wallets.currency, currency),
      ),
    )
    .limit(1);
  if (!wallet) {
    return apiError(`You have no ${currency} wallet with funds to withdraw.`, 400);
  }

  const account = await getOrCreateMemberAccount(session.user.id);
  if (account.status === "locked" || account.status === "closed") {
    return apiError("Your account is not accepting withdrawals. Contact support.", 403);
  }
  if (account.minWithdrawalMinor !== null && parsed.data.amountMinor < account.minWithdrawalMinor) {
    return apiError("This withdrawal is below your minimum withdrawal amount.", 400);
  }

  const funds = await availableBalance(wallet.id);
  if (parsed.data.amountMinor > funds.availableMinor) {
    return apiError(
      funds.reservedMinor > 0
        ? "Insufficient available funds. Some funds are reserved by pending withdrawals."
        : "Insufficient available funds for this withdrawal.",
      400,
    );
  }

  const cooldownDays = account.withdrawalRules.cooldownDays ?? 0;
  if (cooldownDays > 0) {
    const [last] = await db
      .select({ completedAt: withdrawals.completedAt })
      .from(withdrawals)
      .where(and(eq(withdrawals.requesterId, session.user.id), eq(withdrawals.status, "executed")))
      .orderBy(desc(withdrawals.completedAt))
      .limit(1);
    if (last?.completedAt) {
      const nextAllowed = last.completedAt.getTime() + cooldownDays * 86_400_000;
      if (Date.now() < nextAllowed) {
        return apiError(
          `Withdrawals are on cooldown until ${new Date(nextAllowed).toLocaleDateString("en-US")}.`,
          400,
        );
      }
    }
  }

  const rawKey = parsed.data.idempotencyKey ?? `auto:${randomUUID()}`;
  const idempotencyKey = `w:${session.user.id}:${rawKey}`;
  const [existing] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    return apiOk({ withdrawalId: existing.id, status: existing.status, deduplicated: true });
  }

  const entry = await recordPendingEntry({
    walletId: wallet.id,
    direction: "debit",
    amountMinor: parsed.data.amountMinor,
    currency,
    kind: "withdrawal",
    createdBy: session.user.id,
  });
  const [draw] = await db
    .insert(withdrawals)
    .values({
      walletId: wallet.id,
      requesterId: session.user.id,
      amountMinor: parsed.data.amountMinor,
      currency,
      ledgerEntryId: entry.id,
      status: "pending",
      idempotencyKey,
      provider: "tixlpay",
      providerStatus: "awaiting_review",
    })
    .returning({ id: withdrawals.id });
  await db
    .update(ledgerEntries)
    .set({ relatedType: "withdrawal", relatedId: draw.id })
    .where(eq(ledgerEntries.id, entry.id));

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  for (const admin of admins) {
    if (admin.id === session.user.id) continue;
    await notify({
      userId: admin.id,
      type: "wallet",
      title: "Withdrawal awaiting review",
      body: `${session.user.name} requested a withdrawal.`,
      resourceType: "withdrawal",
      resourceId: draw.id,
    });
  }

  await audit({
    actorId: session.user.id,
    action: "wallet.withdrawal.request",
    targetType: "withdrawal",
    targetId: draw.id,
    ipAddress: clientIp(req),
  });

  return apiOk(
    { withdrawalId: draw.id, entryId: entry.id, reference: entry.reference, status: "pending" },
    201,
  );
}

const decideSchema = z.object({
  withdrawalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Review a withdrawal. Group withdrawals are decided by group admins and
 * settle immediately. Individual withdrawals are decided by an admin who is
 * not the requester; approval submits the payout to TixlPay while the funds
 * stay reserved until the provider confirms (wallet.md §5).
 */
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
    return apiError("A reason is required when rejecting a withdrawal.", 400);
  }

  const db = getDb();
  const [draw] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, parsed.data.withdrawalId))
    .limit(1);
  if (!draw || draw.status !== "pending") {
    return apiError("Withdrawal not found or already processed.", 404);
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, draw.walletId)).limit(1);
  if (!wallet) return apiError("Wallet not found.", 404);

  if (wallet.ownerType === "group") {
    return decideGroupWithdrawal(req, {
      draw,
      walletId: wallet.id,
      groupId: wallet.ownerId,
      entryId: draw.ledgerEntryId!,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      reviewerId: session.user.id,
    });
  }

  // Individual wallet: admin review, never the requester.
  if (!isAdminRole(session.user.role)) {
    return apiError("Only administrators can approve individual withdrawals.", 403);
  }
  if (draw.requesterId === session.user.id) {
    return apiError("You cannot approve your own withdrawal.", 403);
  }
  if (!draw.ledgerEntryId) return apiError("Withdrawal has no ledger entry.", 500);

  if (parsed.data.decision === "rejected") {
    try {
      const result = await decideEntry({
        entryId: draw.ledgerEntryId,
        decision: "rejected",
        actorId: session.user.id,
        reason: parsed.data.reason!,
      });
      await db
        .update(withdrawals)
        .set({
          status: "rejected",
          decidedBy: session.user.id,
          decidedAt: new Date(),
          failureReason: parsed.data.reason,
        })
        .where(eq(withdrawals.id, draw.id));
      await notifyMember(draw.requesterId, {
        type: "wallet",
        title: "Withdrawal rejected",
        body: `Your withdrawal was rejected: ${parsed.data.reason}`,
        resourceType: "wallet",
        resourceId: wallet.id,
      });
      await audit({
        actorId: session.user.id,
        action: "wallet.withdrawal.rejected",
        targetType: "withdrawal",
        targetId: draw.id,
        ipAddress: clientIp(req),
      });
      return apiOk(result);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Could not process this withdrawal.", 400);
    }
  }

  // Approval: submit to the payout provider; funds stay reserved (pending
  // debit) until the provider confirms via callback or reconciliation.
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, draw.ledgerEntryId))
    .limit(1);
  if (!entry) return apiError("Withdrawal ledger entry not found.", 500);

  const payout = await submitPayout({
    reference: entry.reference,
    amountMinor: draw.amountMinor,
    currency: draw.currency,
    idempotencyKey: draw.idempotencyKey ?? draw.id,
  });
  if (!payout.ok) {
    return apiError(`The payout provider failed: ${payout.error}. The request stays pending — retry shortly.`, 502);
  }

  await db
    .update(withdrawals)
    .set({
      status: "approved",
      decidedBy: session.user.id,
      decidedAt: new Date(),
      providerReference: payout.submitted ? payout.providerReference : null,
      providerStatus: payout.submitted ? "submitted" : "awaiting_provider",
      submittedAt: payout.submitted ? new Date() : null,
    })
    .where(eq(withdrawals.id, draw.id));

  await notifyMember(draw.requesterId, {
    type: "wallet",
    title: payout.submitted ? "Withdrawal submitted for payout" : "Withdrawal approved",
    body: payout.submitted
      ? `Your withdrawal ${entry.reference} was submitted to the payout provider.`
      : `Your withdrawal ${entry.reference} was approved and awaits the payout provider.`,
    resourceType: "wallet",
    resourceId: wallet.id,
  });
  await audit({
    actorId: session.user.id,
    action: "wallet.withdrawal.approved",
    targetType: "withdrawal",
    targetId: draw.id,
    metadata: payout.submitted ? { providerReference: payout.providerReference } : { pendingProvider: true },
    ipAddress: clientIp(req),
  });
  return apiOk({
    status: "approved",
    providerSubmitted: payout.submitted,
    pendingReason: payout.submitted ? undefined : payout.pendingReason,
  });
}

async function decideGroupWithdrawal(
  req: Request,
  input: {
    draw: { id: string; requesterId: string };
    walletId: string;
    groupId: string;
    entryId: string;
    decision: "approved" | "rejected";
    reason?: string;
    reviewerId: string;
  },
) {
  const db = getDb();
  const [admin] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, input.reviewerId),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!admin) return apiError("Only group admins can approve withdrawals.", 403);

  try {
    const result = await decideEntry({
      entryId: input.entryId,
      decision: input.decision,
      actorId: input.reviewerId,
      reason: input.reason ?? `Withdrawal ${input.decision} by group admin`,
    });
    await db
      .update(withdrawals)
      .set({
        status: input.decision === "approved" ? "executed" : "rejected",
        decidedBy: input.reviewerId,
        decidedAt: new Date(),
        completedAt: input.decision === "approved" ? new Date() : null,
        failureReason: input.decision === "rejected" ? input.reason : null,
      })
      .where(eq(withdrawals.id, input.draw.id));
    await notify({
      userId: input.draw.requesterId,
      type: "wallet",
      title: `Withdrawal ${input.decision}`,
      body: input.decision === "rejected" && input.reason ? input.reason : undefined,
      resourceType: "wallet",
      resourceId: input.walletId,
    });
    await audit({
      actorId: input.reviewerId,
      action: `wallet.withdrawal.group_${input.decision}`,
      targetType: "withdrawal",
      targetId: input.draw.id,
      ipAddress: clientIp(req),
    });
    await emitToRoom(`group:${input.groupId}`, "wallet:updated", { kind: "withdrawal" });
    return apiOk(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not process this withdrawal.", 400);
  }
}
