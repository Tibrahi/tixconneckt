/**
 * Payment-method readiness (role-aware §D2). Method types the product may
 * bind, and honest per-status copy. No provider integration is verified
 * today, so bindings stay pending and TixlPay-dependent flows stay gated.
 */

export const PAYMENT_METHOD_TYPES = ["card", "mobile_money", "crypto", "bank"] as const;

export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  card: "Card",
  mobile_money: "Mobile money",
  crypto: "Cryptocurrency",
  bank: "Bank transfer",
};

export const PAYMENT_METHOD_STATUSES = ["pending", "verified", "failed", "unavailable"] as const;

export type PaymentMethodStatus = (typeof PAYMENT_METHOD_STATUSES)[number];

/** User-facing explanation of each binding state. Pure and unit-tested. */
export function paymentMethodStatusCopy(status: string): string {
  switch (status) {
    case "verified":
      return "Verified and ready for payments.";
    case "failed":
      return "Verification failed. Check the details or bind a different method.";
    case "unavailable":
      return "Unavailable in your region or for this provider right now.";
    default:
      return "Saved and pending — activates only after provider verification. Not proof of payment.";
  }
}

/** Reject display labels that look like full credentials (defense in depth). */
export function looksLikeCredential(label: string): boolean {
  const digits = label.replace(/[^0-9]/g, "");
  // A 13–19 digit run is a full card number, not a masked label.
  if (/\d(?:[ -]?\d){12,18}/.test(label) && digits.length >= 13) return true;
  // PIN/CVV-shaped secrets submitted as the whole label.
  if (/^(?:pin|cvv|cvc|password)\s*[:=]?\s*\S+/i.test(label.trim())) return true;
  return false;
}
