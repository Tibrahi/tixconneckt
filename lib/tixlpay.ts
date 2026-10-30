import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TixlPay payout provider adapter (wallet.md FR-08 §5).
 *
 * The exact TixlPay API is verified against provider documentation before
 * release; until then this module defines the integration boundary:
 * authenticated payout submission, idempotency keys, status checks, and
 * signed callbacks. When credentials are missing every call reports
 * `pending` explicitly — a payout is never faked as completed.
 */

export function tixlpayConfigured(): boolean {
  return Boolean(process.env.TIXLPAY_API_URL && process.env.TIXLPAY_API_KEY);
}

export function tixlpayCallbackConfigured(): boolean {
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
  if (!tixlpayConfigured()) {
    return { ok: true, submitted: false, pendingReason: "TixlPay is not configured" };
  }
  try {
    const res = await fetch(`${process.env.TIXLPAY_API_URL}/v1/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TIXLPAY_API_KEY}`,
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        reference: input.reference,
        amountMinor: input.amountMinor,
        currency: input.currency,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `TixlPay returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as { reference?: string; id?: string; status?: string };
    const providerReference = data.reference ?? data.id;
    if (!providerReference) {
      return { ok: false, error: "TixlPay returned no payout reference" };
    }
    return {
      ok: true,
      submitted: true,
      providerReference,
      providerStatus: data.status ?? "submitted",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "TixlPay request failed" };
  }
}

export type ProviderPayoutStatus =
  | { ok: true; status: "completed" | "failed" | "pending"; providerStatus: string }
  | { ok: true; status: "unknown"; pendingReason: string }
  | { ok: false; error: string };

/** Reconcile a submitted payout against the provider (status check). */
export async function fetchPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
  if (!tixlpayConfigured()) {
    return { ok: true, status: "unknown", pendingReason: "TixlPay is not configured" };
  }
  try {
    const res = await fetch(
      `${process.env.TIXLPAY_API_URL}/v1/payouts/${encodeURIComponent(providerReference)}`,
      { headers: { Authorization: `Bearer ${process.env.TIXLPAY_API_KEY}` } },
    );
    if (!res.ok) return { ok: false, error: `TixlPay returned HTTP ${res.status}` };
    const data = (await res.json()) as { status?: string };
    const raw = String(data.status ?? "").toLowerCase();
    if (["completed", "succeeded", "success", "paid"].includes(raw)) {
      return { ok: true, status: "completed", providerStatus: String(data.status) };
    }
    if (["failed", "rejected", "cancelled", "canceled"].includes(raw)) {
      return { ok: true, status: "failed", providerStatus: String(data.status) };
    }
    return { ok: true, status: "pending", providerStatus: String(data.status ?? "pending") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "TixlPay request failed" };
  }
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
