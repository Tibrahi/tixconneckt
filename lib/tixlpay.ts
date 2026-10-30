import { createHmac, timingSafeEqual } from "node:crypto";

export const TIXLPAY_UNDER_MAINTENANCE = true;
export const TIXLPAY_MAINTENANCE_MESSAGE =
  "TixlPay is under maintenance. Withdrawals through TixlPay are temporarily unavailable.";

/**
 * TixlPay payout provider adapter (wallet.md FR-08 §5).
 *
 * The exact TixlPay API is verified against provider documentation before
 * release; until then this module defines the integration boundary:
 * New payout submissions are paused for phase one. Signed callbacks remain
 * available to settle transfers that were submitted before maintenance.
 */

export function tixlpayConfigured(): boolean {
  return !TIXLPAY_UNDER_MAINTENANCE;
}

export function tixlpayCallbackConfigured(): boolean {
  // Preserve callbacks for already-submitted transfers during maintenance.
  return Boolean(process.env.TIXLPAY_WEBHOOK_SECRET);
}

export interface PayoutSubmitInput {
  /** Our ledger reference (idempotency scope on the provider side too). */
  reference: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}

export type PayoutSubmitResult =
  | { ok: true; submitted: true; providerReference: string; providerStatus: string }
  | { ok: true; submitted: false; pendingReason: string }
  | { ok: false; error: string };

/** Submit an approved withdrawal to TixlPay for payout. */
export async function submitPayout(input: PayoutSubmitInput): Promise<PayoutSubmitResult> {
  void input;
  return { ok: true, submitted: false, pendingReason: TIXLPAY_MAINTENANCE_MESSAGE };
}

export type ProviderPayoutStatus =
  | { ok: true; status: "completed" | "failed" | "pending"; providerStatus: string }
  | { ok: true; status: "unknown"; pendingReason: string }
  | { ok: false; error: string };

/** Reconcile a submitted payout against the provider (status check). */
export async function fetchPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
  void providerReference;
  return { ok: true, status: "unknown", pendingReason: TIXLPAY_MAINTENANCE_MESSAGE };
}

/**
 * Verify a TixlPay callback signature: HMAC-SHA256 hex of the raw body.
 * Rejects missing secrets and malformed signatures without throwing.
 */
export function verifyCallbackSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TIXLPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature.trim(), "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
