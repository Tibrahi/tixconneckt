import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ledgerEntries,
  ledgerTransitions,
  memberAccounts,
  savingsGoals,
  wallets,
  type MemberAccount,
} from "@/db/schema";

/** Generate a unique, human-readable transaction reference. */
export async function generateReference(prefix = "TX"): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rand = crypto.getRandomValues(new Uint8Array(3));
  const suffix = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}-${year}-${suffix}`;
}

/** Get or create a wallet for a user or group in a currency. */
export async function ensureWallet(
  ownerType: "user" | "group",
  ownerId: string,
  currency = "USD",
): Promise<{ id: string; balanceMinor: number; currency: string }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.ownerType, ownerType),
        eq(wallets.ownerId, ownerId),
        eq(wallets.currency, currency.toUpperCase()),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(wallets)
    .values({ ownerType, ownerId, currency: currency.toUpperCase() })
    .returning();
  return created;
}

/**
 * Recompute a wallet balance from approved/credited entries only. The single
 * place balances change — never from unverified proposals or client values.
 * Approval and credit are separate states: `approved` means a reviewer
 * accepted the transaction, `credited` means the balance was updated. An
 * entry stuck at `approved` signals failed processing to reconcile.
 */
export async function recomputeBalance(walletId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      credits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
      debits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'debit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.walletId, walletId),
        inArray(ledgerEntries.status, ["approved", "credited"]),
      ),
    );
  const balance = Number(row?.credits ?? 0) - Number(row?.debits ?? 0);
  await db.update(wallets).set({ balanceMinor: balance }).where(eq(wallets.id, walletId));
  return balance;
}

/**
 * Funds reserved by pending outgoing entries. A pending withdrawal never
 * reduces the ledger balance, but it blocks the same funds from being
 * requested twice (wallet.md §4).
 */
export async function reservedMinor(walletId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amountMinor}), 0)` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.walletId, walletId),
        eq(ledgerEntries.direction, "debit"),
        inArray(ledgerEntries.status, ["pending", "needs_evidence"]),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Spendable funds: ledger balance minus pending outgoing reservations. */
export async function availableBalance(
  walletId: string,
): Promise<{ balanceMinor: number; reservedMinor: number; availableMinor: number }> {
  const db = getDb();
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
  const balanceMinor = wallet?.balanceMinor ?? 0;
  const reserved = await reservedMinor(walletId);
  return { balanceMinor, reservedMinor: reserved, availableMinor: balanceMinor - reserved };
}

export interface RecordEntryInput {
  walletId: string;
  direction: "credit" | "debit";
  amountMinor: number;
  currency: string;
  kind: string;
  relatedType?: string;
  relatedId?: string;
  /** Provider transaction reference (normalized) for duplicate detection. */
  providerRef?: string;
  metadata?: Record<string, unknown>;
  documentId?: string;
  createdBy?: string;
}

/**
 * Record a PENDING ledger entry inside a transaction with its first transition.
 * Approval is a separate authorized step that recomputes the balance.
 */
export async function recordPendingEntry(input: RecordEntryInput): Promise<{ id: string; reference: string }> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Amount must be a positive integer in minor units.");
  }
  const db = getDb();
  const reference = await generateReference();
  const result = await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        walletId: input.walletId,
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: input.currency.toUpperCase(),
        reference,
        status: "pending",
        kind: input.kind,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        providerRef: input.providerRef,
        metadata: input.metadata ?? {},
        documentId: input.documentId,
        createdBy: input.createdBy,
      })
      .returning({ id: ledgerEntries.id });
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: null,
      toStatus: "pending",
      actorId: input.createdBy,
      reason: "Entry recorded, awaiting review",
    });
    return entry;
  });
  return { id: result.id, reference };
}

/** Find an entry already using a provider reference (duplicate detection). */
export async function findEntryByProviderRef(providerRef: string) {
  const db = getDb();
  const [entry] = await db
    .select({ id: ledgerEntries.id, reference: ledgerEntries.reference, status: ledgerEntries.status })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.providerRef, providerRef))
    .limit(1);
  return entry ?? null;
}

export interface DecideEntryInput {
  entryId: string;
  decision: "approved" | "rejected";
  actorId: string;
  reason?: string;
}

/**
 * Approve or reject a pending (or needs_evidence, for approval after
 * resubmission) entry. Rejection requires a reason. Approval debits are
 * checked against the available balance to prevent double spending.
 *
 * Approval and credit happen atomically in one transaction: the entry moves
 * pending → approved → credited and the wallet balance is recomputed from
 * approved/credited entries only. Credit exactly once is enforced by the
 * conditional status update — a second approval finds no pending row.
 */
export async function decideEntry(input: DecideEntryInput): Promise<{ balanceMinor: number }> {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, input.entryId))
    .limit(1);
  if (!entry) throw new Error("Transaction not found.");
  if (entry.status !== "pending" && entry.status !== "needs_evidence") {
    throw new Error("This transaction has already been processed.");
  }

  if (input.decision === "rejected") {
    const reason = input.reason?.trim();
    if (!reason) throw new Error("A reason is required when rejecting a transaction.");
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(ledgerEntries)
        .set({ status: "rejected", decidedBy: input.actorId, decidedAt: new Date() })
        .where(
          and(
            eq(ledgerEntries.id, entry.id),
            inArray(ledgerEntries.status, ["pending", "needs_evidence"]),
          ),
        )
        .returning({ id: ledgerEntries.id });
      if (updated.length === 0) {
        throw new Error("This request has already been processed. Refresh to see its latest status.");
      }
      await tx.insert(ledgerTransitions).values({
        entryId: entry.id,
        fromStatus: entry.status,
        toStatus: "rejected",
        actorId: input.actorId,
        reason,
      });
    });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
    return { balanceMinor: wallet?.balanceMinor ?? 0 };
  }

  // Approval path with overspend + duplicate protection.
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  if (!wallet) throw new Error("Wallet not found.");
  if (entry.direction === "debit") {
    const { availableMinor } = await availableBalance(entry.walletId);
    // This entry's own reservation counts against availability; add it back
    // so the check compares the balance against other reservations + this entry.
    const spendableForThisEntry = availableMinor + entry.amountMinor;
    if (spendableForThisEntry < entry.amountMinor) {
      throw new Error("Insufficient available balance for this transaction.");
    }
  }

  const reason = input.reason?.trim() || "Approved";
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(ledgerEntries)
      .set({ status: "approved", decidedBy: input.actorId, decidedAt: new Date() })
      .where(
        and(
          eq(ledgerEntries.id, entry.id),
          inArray(ledgerEntries.status, ["pending", "needs_evidence"]),
        ),
      )
      .returning({ id: ledgerEntries.id });
    if (updated.length === 0) {
      throw new Error("This request has already been processed. Refresh to see its latest status.");
    }
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: entry.status,
      toStatus: "approved",
      actorId: input.actorId,
      reason,
    });
    // Recompute inside the same transaction so approval and credit are atomic.
    const [row] = await tx
      .select({
        credits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
        debits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'debit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.walletId, entry.walletId),
          inArray(ledgerEntries.status, ["approved", "credited"]),
        ),
      );
    const balance = Number(row?.credits ?? 0) - Number(row?.debits ?? 0);
    await tx.update(wallets).set({ balanceMinor: balance }).where(eq(wallets.id, entry.walletId));
    await tx
      .update(ledgerEntries)
      .set({ status: "credited" })
      .where(eq(ledgerEntries.id, entry.id));
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: "approved",
      toStatus: "credited",
      actorId: input.actorId,
      reason: "Balance updated",
    });
  });

  const [finalWallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  return { balanceMinor: finalWallet?.balanceMinor ?? 0 };
}

export interface ReviewTransitionInput {
  entryId: string;
  actorId: string;
  reason: string;
}

/** Reviewer asks the uploader for additional evidence (pending → needs_evidence). */
export async function requestEvidence(input: ReviewTransitionInput): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Describe what additional evidence is needed.");
  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, input.entryId))
    .limit(1);
  if (!entry || entry.status !== "pending") {
    throw new Error("This transaction is not awaiting review.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(ledgerEntries)
      .set({ status: "needs_evidence" })
      .where(and(eq(ledgerEntries.id, entry.id), eq(ledgerEntries.status, "pending")));
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: "pending",
      toStatus: "needs_evidence",
      actorId: input.actorId,
      reason,
    });
  });
}

/** Uploader resubmits after adding evidence (needs_evidence → pending). */
export async function resubmitEntry(entryId: string, actorId: string): Promise<void> {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, entryId))
    .limit(1);
  if (!entry || entry.status !== "needs_evidence") {
    throw new Error("This transaction is not waiting for evidence.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(ledgerEntries)
      .set({ status: "pending" })
      .where(and(eq(ledgerEntries.id, entry.id), eq(ledgerEntries.status, "needs_evidence")));
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: "needs_evidence",
      toStatus: "pending",
      actorId,
      reason: "Uploader provided additional evidence",
    });
  });
}

/** Owner cancels their own unprocessed entry (pending/needs_evidence → cancelled). */
export async function cancelEntry(entryId: string, actorId: string): Promise<void> {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, entryId))
    .limit(1);
  if (!entry || (entry.status !== "pending" && entry.status !== "needs_evidence")) {
    throw new Error("This transaction can no longer be cancelled.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(ledgerEntries)
      .set({ status: "cancelled", decidedBy: actorId, decidedAt: new Date() })
      .where(
        and(
          eq(ledgerEntries.id, entry.id),
          inArray(ledgerEntries.status, ["pending", "needs_evidence"]),
        ),
      );
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: entry.status,
      toStatus: "cancelled",
      actorId,
      reason: "Cancelled by owner",
    });
  });
}

/** Latest decision reason for an entry (rejection/evidence explanations). */
export async function latestTransitionReason(entryId: string): Promise<string | null> {
  const db = getDb();
  const { desc } = await import("drizzle-orm");
  const [t] = await db
    .select({ reason: ledgerTransitions.reason })
    .from(ledgerTransitions)
    .where(eq(ledgerTransitions.entryId, entryId))
    .orderBy(desc(ledgerTransitions.createdAt))
    .limit(1);
  return t?.reason ?? null;
}

/** Get or create a member's savings account configuration with defaults. */
export async function getOrCreateMemberAccount(userId: string): Promise<MemberAccount> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(memberAccounts)
    .where(eq(memberAccounts.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(memberAccounts).values({ userId }).returning();
  return created;
}

/** Check whether a savings goal reached its target after a contribution. */
export async function goalProgress(goalId: string): Promise<{
  goal: { name: string; targetMinor: number | null; currency: string; groupId: string };
  collectedMinor: number;
  reached: boolean;
} | null> {
  const db = getDb();
  const { contributions } = await import("@/db/schema");
  const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
  if (!goal) return null;
  const rows = await db
    .select({ amountMinor: contributions.amountMinor })
    .from(contributions)
    .where(and(eq(contributions.goalId, goalId), eq(contributions.status, "approved")));
  const collectedMinor = rows.reduce((sum, r) => sum + r.amountMinor, 0);
  return {
    goal: { name: goal.name, targetMinor: goal.targetMinor, currency: goal.currency, groupId: goal.groupId },
    collectedMinor,
    reached: goal.targetMinor !== null && collectedMinor >= goal.targetMinor,
  };
}
