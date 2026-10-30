import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ledgerEntries, users, withdrawals } from "@/db/schema";
import { audit } from "./audit";
import { withdrawalEmail } from "./email";
import { notifyAdmins, notifyMember } from "./notify";
import { decideEntry } from "./wallet";

export interface SettleWithdrawalInput {
  withdrawalId: string;
  outcome: "completed" | "failed";
  providerStatus: string;
  failureReason?: string;
  /** Reviewer attribution for the ledger decision (defaults to the original reviewer). */
  actorId?: string;
  ipAddress?: string;
}

/**
 * Settle a provider-submitted withdrawal exactly once.
 *
 * Completed: the pending debit is approved→credited (balance drops only now),
 * the member and every system administrator are notified by in-app alert and
 * email. Failed: the pending debit is rejected so reserved funds release.
 * Replays of an already-settled withdrawal return deduplicated:true.
 */
export async function settleWithdrawal(
  input: SettleWithdrawalInput,
): Promise<{ settled: boolean; deduplicated: boolean }> {
  const db = getDb();
  const [draw] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, input.withdrawalId))
    .limit(1);
  if (!draw) throw new Error("Withdrawal not found.");
  if (draw.status === "executed" || draw.status === "failed") {
    return { settled: false, deduplicated: true };
  }
  if (!draw.ledgerEntryId) throw new Error("Withdrawal has no ledger entry.");

  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, draw.ledgerEntryId))
    .limit(1);
  if (!entry) throw new Error("Withdrawal ledger entry not found.");

  const [member] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, draw.requesterId))
    .limit(1);
  const memberName = member?.name ?? "Member";
  const actorId = input.actorId ?? draw.decidedBy ?? draw.requesterId;

  if (input.outcome === "completed") {
    await decideEntry({
      entryId: entry.id,
      decision: "approved",
      actorId,
      reason: "Provider confirmed payout",
    });
    await db
      .update(withdrawals)
      .set({
        status: "executed",
        providerStatus: input.providerStatus,
        completedAt: new Date(),
      })
      .where(eq(withdrawals.id, draw.id));

    const email = withdrawalEmail({
      memberName,
      amountMinor: draw.amountMinor,
      currency: draw.currency,
      status: "completed",
      reference: entry.reference,
    });
    await notifyMember(draw.requesterId, {
      type: "wallet",
      title: "Withdrawal completed",
      body: `Your withdrawal ${entry.reference} was completed.`,
      resourceType: "wallet",
      resourceId: draw.walletId,
      email,
    });
    await notifyAdmins({
      title: "Withdrawal completed",
      body: `${memberName} withdrew ${(draw.amountMinor / 100).toLocaleString("en-US")} ${draw.currency} (${entry.reference}).`,
      resourceType: "wallet",
      resourceId: draw.walletId,
      email,
    });
    await audit({
      actorId,
      action: "wallet.withdrawal.completed",
      targetType: "withdrawal",
      targetId: draw.id,
      metadata: { providerStatus: input.providerStatus },
      ipAddress: input.ipAddress,
    });
    return { settled: true, deduplicated: false };
  }

  const reason = input.failureReason?.trim() || "Provider reported payout failure";
  await decideEntry({ entryId: entry.id, decision: "rejected", actorId, reason });
  await db
    .update(withdrawals)
    .set({
      status: "failed",
      providerStatus: input.providerStatus,
      failureReason: reason,
      completedAt: new Date(),
    })
    .where(eq(withdrawals.id, draw.id));

  const email = withdrawalEmail({
    memberName,
    amountMinor: draw.amountMinor,
    currency: draw.currency,
    status: "failed",
    reference: entry.reference,
    reason,
  });
  await notifyMember(draw.requesterId, {
    type: "wallet",
    title: "Withdrawal failed",
    body: `Your withdrawal ${entry.reference} failed. Reserved funds were released.`,
    resourceType: "wallet",
    resourceId: draw.walletId,
    email,
  });
  await notifyAdmins({
    title: "Withdrawal failed",
    body: `${memberName}'s withdrawal ${entry.reference} failed: ${reason}`,
    resourceType: "wallet",
    resourceId: draw.walletId,
    email,
  });
  await audit({
    actorId,
    action: "wallet.withdrawal.failed",
    targetType: "withdrawal",
    targetId: draw.id,
    metadata: { providerStatus: input.providerStatus, failureReason: reason },
    ipAddress: input.ipAddress,
  });
  return { settled: true, deduplicated: false };
}
