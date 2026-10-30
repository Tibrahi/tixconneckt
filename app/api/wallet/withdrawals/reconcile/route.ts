import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { ledgerEntries, wallets, withdrawals } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { settleWithdrawal } from "@/lib/payout";
import { getSession, isAdminRole } from "@/lib/session";
import { fetchPayoutStatus, submitPayout, tixlpayConfigured } from "@/lib/tixlpay";

const reconcileSchema = z.object({
  withdrawalId: z.string().min(1),
});

/**
 * Admin reconciliation for approved individual withdrawals (wallet.md §5):
 * submits payouts the provider never received (late configuration or
 * outage) and settles submitted payouts against the provider status check.
 * Safe to repeat — settlement is idempotent.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (!isAdminRole(session.user.role)) {
    return apiError("Only administrators can reconcile payouts.", 403);
  }
  if (!tixlpayConfigured()) {
    return apiError("TixlPay is not configured. Configure it, then reconcile again.", 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const db = getDb();
  const [draw] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, parsed.data.withdrawalId))
    .limit(1);
  if (!draw) return apiError("Withdrawal not found.", 404);
  if (draw.status !== "approved") {
    return apiError(`Only approved withdrawals can be reconciled (status: ${draw.status}).`, 400);
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, draw.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "user") {
    return apiError("Only individual withdrawals are reconciled here.", 400);
  }

  let providerReference = draw.providerReference;
  if (!providerReference) {
    if (!draw.ledgerEntryId) return apiError("Withdrawal has no ledger entry.", 500);
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
    if (!payout.ok) return apiError(`The payout provider failed: ${payout.error}.`, 502);
    if (!payout.submitted) return apiError(payout.pendingReason, 503);
    providerReference = payout.providerReference;
    await db
      .update(withdrawals)
      .set({ providerReference, providerStatus: "submitted", submittedAt: new Date() })
      .where(eq(withdrawals.id, draw.id));
  }

  const status = await fetchPayoutStatus(providerReference);
  if (!status.ok) return apiError(`The payout provider failed: ${status.error}.`, 502);
  if (status.status === "unknown") return apiError(status.pendingReason, 503);
  if (status.status === "pending") {
    await db
      .update(withdrawals)
      .set({ providerStatus: status.providerStatus })
      .where(eq(withdrawals.id, draw.id));
    return apiOk({ status: "approved", providerStatus: status.providerStatus });
  }

  try {
    const result = await settleWithdrawal({
      withdrawalId: draw.id,
      outcome: status.status,
      providerStatus: status.providerStatus,
      actorId: session.user.id,
    });
    return apiOk({ ...result, status: status.status });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not settle this payout.", 400);
  }
}
