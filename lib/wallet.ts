import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ledgerEntries,
  ledgerTransitions,
  savingsGoals,
  wallets,
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
 * Recompute a wallet balance from approved entries only. The single place
 * balances change — never from unverified proposals or client values.
 */
export async function recomputeBalance(walletId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      credits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
      debits: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'debit' THEN ${ledgerEntries.amountMinor} ELSE 0 END), 0)`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.walletId, walletId), eq(ledgerEntries.status, "approved")));
  const balance = Number(row?.credits ?? 0) - Number(row?.debits ?? 0);
  await db.update(wallets).set({ balanceMinor: balance }).where(eq(wallets.id, walletId));
  return balance;
}

export interface RecordEntryInput {
  walletId: string;
  direction: "credit" | "debit";
  amountMinor: number;
  currency: string;
  kind: string;
  relatedType?: string;
  relatedId?: string;
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
      reason: "Entry recorded, awaiting approval",
    });
    return entry;
  });
  return { id: result.id, reference };
}

export interface DecideEntryInput {
  entryId: string;
  decision: "approved" | "rejected";
  actorId: string;
  reason?: string;
}

/**
 * Approve or reject a pending entry. Approval debits are checked against the
 * current balance to prevent double spending; approval recomputes the balance.
 */
export async function decideEntry(input: DecideEntryInput): Promise<{ balanceMinor: number }> {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, input.entryId))
    .limit(1);
  if (!entry) throw new Error("Transaction not found.");
  if (entry.status !== "pending") throw new Error("This transaction has already been processed.");

  if (input.decision === "rejected") {
    await db.transaction(async (tx) => {
      await tx
        .update(ledgerEntries)
        .set({ status: "rejected", decidedBy: input.actorId, decidedAt: new Date() })
        .where(eq(ledgerEntries.id, entry.id));
      await tx.insert(ledgerTransitions).values({
        entryId: entry.id,
        fromStatus: "pending",
        toStatus: "rejected",
        actorId: input.actorId,
        reason: input.reason ?? "Rejected",
      });
    });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
    return { balanceMinor: wallet?.balanceMinor ?? 0 };
  }

  // Approval path with overspend + duplicate protection.
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  if (!wallet) throw new Error("Wallet not found.");
  if (entry.direction === "debit" && wallet.balanceMinor < entry.amountMinor) {
    throw new Error("Insufficient balance for this transaction.");
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(ledgerEntries)
      .set({ status: "approved", decidedBy: input.actorId, decidedAt: new Date() })
      .where(and(eq(ledgerEntries.id, entry.id), eq(ledgerEntries.status, "pending")))
      .returning({ id: ledgerEntries.id });
    if (updated.length === 0) {
      throw new Error("This request has already been processed. Refresh to see its latest status.");
    }
    await tx.insert(ledgerTransitions).values({
      entryId: entry.id,
      fromStatus: "pending",
      toStatus: "approved",
      actorId: input.actorId,
      reason: input.reason ?? "Approved",
    });
  });

  const balanceMinor = await recomputeBalance(entry.walletId);

  // Savings threshold notifications are handled by callers with group context.
  return { balanceMinor };
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
