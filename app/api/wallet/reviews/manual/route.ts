import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { parsingJobs, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { isSupportedCurrency } from "@/lib/currency";
import { depositDecisionEmail } from "@/lib/email";
import { notifyMember } from "@/lib/notify";
import { normalizeProviderRef } from "@/lib/proof";
import { getSession, isAdminRole } from "@/lib/session";
import { manualCreditSchema } from "@/lib/validation";
import {
  decideEntry,
  ensureWallet,
  findEntryByProviderRef,
  getOrCreateMemberAccount,
  recordPendingEntry,
} from "@/lib/wallet";

/**
 * Authorized correction workflow (wallet.md FR-02/FR-04): when evidence could
 * not be parsed automatically, a reviewer who is NOT the uploader verifies
 * the proof and records the verified values. The entry is still created
 * pending first and then approved, so the full transition history is kept.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (!isAdminRole(session.user.role)) {
    return apiError("Only reviewers can verify evidence manually.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = manualCreditSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Provide the verified amount, currency, and a verification note.", 400);
  }

  const db = getDb();
  const [job] = await db
    .select()
    .from(parsingJobs)
    .where(eq(parsingJobs.id, parsed.data.parsingJobId))
    .limit(1);
  if (!job) return apiError("Evidence not found.", 404);
  if (job.destinationId) {
    return apiError("This evidence was already verified.", 409);
  }
  if (job.destinationType !== "wallet") {
    return apiError("Only wallet evidence can be verified here.", 400);
  }
  if (job.status !== "failed" && job.status !== "pending") {
    return apiError("This evidence already has extracted values. Review it in the queue instead.", 400);
  }
  if (job.requestedBy === session.user.id) {
    return apiError("You cannot verify your own evidence.", 403);
  }

  const verified = parsed.data.verified;
  if (verified.direction !== "credit") {
    return apiError("Only incoming deposits can be verified here.", 400);
  }
  if (!isSupportedCurrency(verified.currency)) {
    return apiError(`Currency ${verified.currency} is not supported.`, 400);
  }

  const account = await getOrCreateMemberAccount(job.requestedBy);
  if (account.status === "locked" || account.status === "closed") {
    return apiError("The member's account is not accepting deposits.", 403);
  }
  if (account.minContributionMinor !== null && verified.amountMinor < account.minContributionMinor) {
    return apiError("This deposit is below the member's minimum contribution.", 400);
  }
  if (account.maxContributionMinor !== null && verified.amountMinor > account.maxContributionMinor) {
    return apiError("This deposit exceeds the member's maximum contribution.", 400);
  }

  const providerRef = verified.reference ? normalizeProviderRef(verified.reference) : undefined;
  if (providerRef) {
    const duplicate = await findEntryByProviderRef(providerRef);
    if (duplicate) {
      return apiError(
        `This transaction was already submitted (${duplicate.reference}, ${duplicate.status}).`,
        409,
      );
    }
  }

  const wallet = await ensureWallet("user", job.requestedBy, verified.currency);
  const entry = await recordPendingEntry({
    walletId: wallet.id,
    direction: "credit",
    amountMinor: verified.amountMinor,
    currency: verified.currency,
    kind: "self_funding",
    relatedType: "parsing_job",
    relatedId: job.id,
    providerRef,
    metadata: {
      sender: verified.sender,
      recipient: verified.recipient,
      provider: verified.provider,
      paymentStatus: verified.paymentStatus,
      providerReference: verified.reference,
      description: verified.description,
      occurredAt: verified.occurredAt,
      manualReview: true,
      verificationNote: parsed.data.reason,
    },
    documentId: job.documentId ?? undefined,
    createdBy: job.requestedBy,
  });
  await db
    .update(parsingJobs)
    .set({ status: "approved", destinationId: entry.id })
    .where(and(eq(parsingJobs.id, job.id)));

  const result = await decideEntry({
    entryId: entry.id,
    decision: "approved",
    actorId: session.user.id,
    reason: parsed.data.reason,
  });

  const [uploader] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, job.requestedBy))
    .limit(1);
  if (uploader) {
    const email = depositDecisionEmail({
      memberName: uploader.name,
      amountMinor: verified.amountMinor,
      currency: verified.currency,
      status: "credited",
      reference: entry.reference,
      reason: parsed.data.reason,
    });
    await notifyMember(uploader.id, {
      type: "wallet",
      title: "Deposit verified and credited",
      body: `Your deposit ${entry.reference} was verified and credited.`,
      resourceType: "wallet",
      resourceId: wallet.id,
      email,
    });
  }

  await audit({
    actorId: session.user.id,
    action: "wallet.review.manual_credit",
    targetType: "ledger_entry",
    targetId: entry.id,
    metadata: { parsingJobId: job.id },
    ipAddress: clientIp(req),
  });

  return apiOk({ ...result, entryId: entry.id, reference: entry.reference }, 201);
}
