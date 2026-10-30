import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { documents, ledgerEntries, parsingJobs, wallets } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { isSupportedCurrency } from "@/lib/currency";
import { notify } from "@/lib/notify";
import { extractionCompleteness, normalizeProviderRef } from "@/lib/proof";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { transactionProposalSchema } from "@/lib/validation";
import {
  cancelEntry,
  ensureWallet,
  findEntryByProviderRef,
  getOrCreateMemberAccount,
  recordPendingEntry,
  resubmitEntry,
} from "@/lib/wallet";

const submitSchema = z.object({
  /** Parsing job whose server-side extracted values fund this deposit. */
  parsingJobId: z.string().min(1),
});

/**
 * Individual deposit step 1: submit transaction evidence for verification.
 *
 * Values come ONLY from the server-side AI extraction (wallet.md FR-02) —
 * the member cannot edit amounts directly. The entry is recorded PENDING and
 * never touches the balance until an independent reviewer approves it
 * (FR-04/FR-05). Members cannot approve their own submissions.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("deposit", session.user.id, 20, "1 h");
  if (!rl.allowed) return apiError("Too many submissions. Please try again later.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return apiError("Select the verified transaction evidence to submit.", 400);

  const db = getDb();
  const [job] = await db
    .select()
    .from(parsingJobs)
    .where(
      and(eq(parsingJobs.id, parsed.data.parsingJobId), eq(parsingJobs.requestedBy, session.user.id)),
    )
    .limit(1);
  if (!job) return apiError("Transaction evidence not found.", 404);
  if (job.destinationId) {
    return apiError("This evidence was already submitted for verification.", 409);
  }
  if (job.status !== "needs_review" || !job.proposedJson) {
    // No usable extraction (AI unavailable or unreadable evidence): queue the
    // original evidence for authorized manual verification instead of
    // trusting incomplete data (wallet.md FR-02/FR-03).
    if (job.status === "pending" || job.status === "processing" || job.status === "failed") {
      await db
        .update(parsingJobs)
        .set({
          status: "failed",
          error: job.error ?? "Queued for manual review: automatic extraction unavailable.",
        })
        .where(eq(parsingJobs.id, job.id));
      await audit({
        actorId: session.user.id,
        action: "wallet.deposit.manual_queue",
        targetType: "parsing_job",
        targetId: job.id,
        ipAddress: clientIp(req),
      });
      return apiOk({ queuedForManualReview: true }, 202);
    }
    return apiError("Run extraction on this evidence before submitting it.", 400);
  }

  const stored = { ...(job.proposedJson as Record<string, unknown>) };
  delete stored.extra;
  const tx = transactionProposalSchema.safeParse(stored);
  if (!tx.success) return apiError("The extracted transaction data is invalid.", 400);
  if (tx.data.direction !== "credit") {
    return apiError("Only incoming deposits can be submitted here. Use withdrawals to send funds out.", 400);
  }
  if (!isSupportedCurrency(tx.data.currency)) {
    return apiError(`Currency ${tx.data.currency} is not supported.`, 400);
  }

  const account = await getOrCreateMemberAccount(session.user.id);
  if (account.status === "locked" || account.status === "closed") {
    return apiError("Your account is not accepting deposits. Contact support.", 403);
  }
  if (account.minContributionMinor !== null && tx.data.amountMinor < account.minContributionMinor) {
    return apiError("This deposit is below your minimum contribution.", 400);
  }
  if (account.maxContributionMinor !== null && tx.data.amountMinor > account.maxContributionMinor) {
    return apiError("This deposit exceeds your maximum contribution.", 400);
  }

  const providerRef = tx.data.reference ? normalizeProviderRef(tx.data.reference) : undefined;
  if (providerRef) {
    const duplicate = await findEntryByProviderRef(providerRef);
    if (duplicate) {
      return apiError(
        `This transaction was already submitted (${duplicate.reference}, ${duplicate.status}).`,
        409,
      );
    }
  }

  const wallet = await ensureWallet("user", session.user.id, tx.data.currency);
  const completeness = extractionCompleteness(tx.data);

  let entry: { id: string; reference: string };
  try {
    entry = await recordPendingEntry({
      walletId: wallet.id,
      direction: "credit",
      amountMinor: tx.data.amountMinor,
      currency: tx.data.currency,
      kind: "self_funding",
      relatedType: "parsing_job",
      relatedId: job.id,
      providerRef,
      metadata: {
        sender: tx.data.sender,
        recipient: tx.data.recipient,
        provider: tx.data.provider,
        paymentStatus: tx.data.paymentStatus,
        providerReference: tx.data.reference,
        description: tx.data.description,
        occurredAt: tx.data.occurredAt,
        extractionConfidence: tx.data.extractionConfidence,
        extractionComplete: completeness.complete,
        extractionMissing: completeness.missing,
      },
      documentId: job.documentId ?? undefined,
      createdBy: session.user.id,
    });
  } catch (error) {
    // Unique provider_ref race: a concurrent submit won; report duplication.
    if (providerRef && (await findEntryByProviderRef(providerRef))) {
      return apiError("This transaction was already submitted.", 409);
    }
    throw error;
  }

  await db
    .update(parsingJobs)
    .set({ status: "approved", destinationId: entry.id })
    .where(eq(parsingJobs.id, job.id));

  // Reviewers (admins) get an in-app alert for the new queue item.
  const { users } = await import("@/db/schema");
  const reviewers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));
  for (const reviewer of reviewers) {
    if (reviewer.id === session.user.id) continue;
    await notify({
      userId: reviewer.id,
      type: "wallet",
      title: "Deposit awaiting review",
      body: `${session.user.name} submitted a deposit for verification.`,
      resourceType: "ledger_entry",
      resourceId: entry.id,
    });
  }

  await audit({
    actorId: session.user.id,
    action: "wallet.deposit.submit",
    targetType: "ledger_entry",
    targetId: entry.id,
    metadata: { parsingJobId: job.id },
    ipAddress: clientIp(req),
  });

  return apiOk({ entryId: entry.id, reference: entry.reference }, 201);
}

const ownerActionSchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(["cancel", "resubmit"]),
  /** Optional replacement evidence when resubmitting. */
  documentId: z.string().min(1).optional(),
});

/**
 * Individual deposit step 2 (owner side): the uploader can only cancel a
 * pending entry or resubmit after an evidence request — approval is reserved
 * for an independent reviewer (wallet.md FR-04).
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
  const parsed = ownerActionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid action.", 400);

  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, parsed.data.entryId))
    .limit(1);
  if (!entry) return apiError("Transaction not found.", 404);
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "user" || wallet.ownerId !== session.user.id) {
    return apiError("You can only manage your own individual transactions.", 403);
  }
  if (entry.kind !== "self_funding") {
    return apiError("Only individual deposits can be managed here.", 400);
  }

  try {
    if (parsed.data.action === "cancel") {
      await cancelEntry(entry.id, session.user.id);
      await audit({
        actorId: session.user.id,
        action: "wallet.deposit.cancel",
        targetType: "ledger_entry",
        targetId: entry.id,
        ipAddress: clientIp(req),
      });
      return apiOk({ status: "cancelled" });
    }

    if (parsed.data.documentId) {
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, parsed.data.documentId), eq(documents.ownerId, session.user.id)))
        .limit(1);
      if (!doc) return apiError("Supporting document not found.", 404);
      await db
        .update(ledgerEntries)
        .set({ documentId: doc.id })
        .where(eq(ledgerEntries.id, entry.id));
    }
    await resubmitEntry(entry.id, session.user.id);
    await audit({
      actorId: session.user.id,
      action: "wallet.deposit.resubmit",
      targetType: "ledger_entry",
      targetId: entry.id,
      ipAddress: clientIp(req),
    });
    return apiOk({ status: "pending" });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not update this transaction.", 400);
  }
}
