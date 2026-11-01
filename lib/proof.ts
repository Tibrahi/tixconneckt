import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  transactionProposalSchema,
  type TransactionProposal,
} from "./validation";
import { validateFieldName, validateFieldValue } from "./flexible-records";

const KNOWN_TX_KEYS = new Set([
  "amountMinor",
  "currency",
  "direction",
  "reference",
  "sender",
  "recipient",
  "provider",
  "paymentStatus",
  "description",
  "occurredAt",
  "extractionConfidence",
]);

export interface SplitExtraction {
  tx: TransactionProposal;
  extra: Record<string, unknown>;
}

/** Explicit alias map: provider/model names → canonical transaction field. */
const TX_ALIASES: Record<string, string[]> = {
  amountMinor: ["amount_minor", "amountCents", "amount_cents", "amount", "value", "total", "sum"],
  currency: ["currencyCode", "currency_code", "ccy"],
  direction: ["type", "flow", "kind", "transactionType", "transaction_type"],
  reference: ["transactionRef", "transaction_ref", "txnRef", "txn_ref", "txId", "tx_id", "transactionId", "ref", "receiptNo", "receipt_no", "receipt"],
  sender: ["senderName", "sender_name", "from", "payer", "source"],
  recipient: ["recipientName", "recipient_name", "to", "payee", "beneficiary", "destination"],
  provider: ["paymentProvider", "payment_provider", "processor", "network", "bank", "mobileMoneyProvider", "channel"],
  paymentStatus: ["status", "state", "transactionStatus"],
  // Note: "note" and "details" stay preserved extras, not aliases — the
  // existing contract keeps them reviewable rather than mapped.
  description: ["narrative", "memo", "purpose", "remark"],
  occurredAt: ["date", "transactionDate", "transaction_date", "timestamp", "createdAt", "created_at", "time", "occurred_at"],
  extractionConfidence: ["confidence", "score", "certainty"],
};

/** Wrapper keys unwrapped when the model nests the transaction one level deep. */
const TX_WRAPPERS = ["transaction", "payment", "transfer", "extraction", "data", "result"];

/** Alias keys consumed by normalization — excluded from preserved extras. */
const TX_ALIAS_KEYS = new Set(Object.values(TX_ALIASES).flat());

const CREDIT_WORDS = new Set(["credit", "credits", "incoming", "inbound", "in", "received", "receive", "deposit", "deposits", "topup", "top-up", "refund", "refunds"]);
const DEBIT_WORDS = new Set(["debit", "debits", "outgoing", "outbound", "out", "sent", "send", "payment", "payments", "pay", "withdrawal", "withdrawals", "withdraw", "purchase", "purchases", "charge"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce an amount to minor units. Integers follow the documented contract
 * (already minor); decimals and decorated strings ("$50.00", "1,500 RWF")
 * are major units converted ×100. Unparseable input stays undefined so the
 * strict schema rejects it with the field named.
 */
function toAmountMinor(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const decorated = /[$€£¥₹]|(?<![0-9.,])[A-Za-z]{2,}|,/.test(text) || /\.\d{1,2}\b/.test(text);
  const numeric = Number(text.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (!decorated && Number.isInteger(numeric)) return numeric;
  return Math.round(numeric * 100);
}

function toDirection(value: unknown): string {
  if (typeof value !== "string") return "";
  const word = value.trim().toLowerCase();
  if (word === "credit" || word === "debit") return word;
  if (CREDIT_WORDS.has(word)) return "credit";
  if (DEBIT_WORDS.has(word)) return "debit";
  return value;
}

function toCurrency(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const code = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return code || value;
}

function toOccurredAt(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  const text = value.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function toConfidence(value: unknown): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return Math.round((value / 100) * 1000) / 1000;
  return value;
}

const TX_COERCIONS: Record<string, (value: unknown) => unknown> = {
  amountMinor: toAmountMinor,
  currency: toCurrency,
  direction: toDirection,
  occurredAt: toOccurredAt,
  extractionConfidence: toConfidence,
};

/**
 * Map a raw AI extraction onto canonical transaction field names: resolve
 * documented aliases, fill gaps from one level of nesting, and coerce
 * decorated values. Final validation stays strict — this only translates,
 * never invents.
 */
export function normalizeExtraction(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const sources = [raw];
  for (const wrapper of TX_WRAPPERS) {
    const nested = raw[wrapper];
    if (isRecord(nested)) sources.push(nested);
  }
  const normalized: Record<string, unknown> = {};
  for (const field of KNOWN_TX_KEYS) {
    const candidates = [field, ...(TX_ALIASES[field] ?? [])];
    for (const source of sources) {
      let found = false;
      for (const key of candidates) {
        if (!(key in source)) continue;
        const coerce = TX_COERCIONS[field];
        const value = coerce ? coerce(source[key]) : source[key];
        if (value !== undefined) {
          normalized[field] = value;
          found = true;
        }
        break;
      }
      if (found) break;
    }
  }
  return normalized;
}

/**
 * Split an AI extraction into strictly-validated transaction fields plus
 * preserved extra fields. Unknown information is kept for review — never
 * silently discarded, never trusted for money movement.
 */
export function splitExtraction(
  raw: unknown,
): { ok: true; value: SplitExtraction } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "The AI result did not match the required format." };
  }
  const normalized = normalizeExtraction(raw);
  const validated = transactionProposalSchema.safeParse(normalized);
  if (!validated.success) {
    const fields = [...new Set(validated.error.issues.map((issue) => String(issue.path[0] ?? "value")))];
    return { ok: false, error: `The extracted data was invalid (${fields.join(", ")}). Correct the values manually instead.` };
  }
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (KNOWN_TX_KEYS.has(key) || TX_ALIAS_KEYS.has(key)) continue;
    if (TX_WRAPPERS.includes(key) && isRecord(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (KNOWN_TX_KEYS.has(nestedKey) || TX_ALIAS_KEYS.has(nestedKey)) continue;
        if (validateFieldName(nestedKey) !== null) continue;
        if (validateFieldValue(nestedValue, 0) !== null) continue;
        if (Object.keys(extra).length >= 50) break;
        extra[nestedKey] = nestedValue;
      }
      continue;
    }
    if (validateFieldName(key) !== null) continue;
    if (validateFieldValue(value, 0) !== null) continue;
    if (Object.keys(extra).length >= 50) break;
    extra[key] = value;
  }
  return { ok: true, value: { tx: validated.data, extra } };
}

/**
 * Completeness check for verification (wallet.md FR-03). Amount and currency
 * are mandatory; reference/sender/provider strengthen verification but an
 * incomplete extraction is routed to manual review instead of being trusted.
 */
export function extractionCompleteness(tx: TransactionProposal): {
  complete: boolean;
  missing: string[];
  lowConfidence: boolean;
} {
  const missing: string[] = [];
  if (!tx.reference) missing.push("reference");
  if (!tx.sender) missing.push("sender");
  if (!tx.provider) missing.push("provider");
  const lowConfidence =
    tx.extractionConfidence !== undefined &&
    tx.extractionConfidence < EXTRACTION_CONFIDENCE_THRESHOLD;
  return { complete: missing.length === 0 && !lowConfidence, missing, lowConfidence };
}

/** Normalize a provider reference for duplicate detection. */
export function normalizeProviderRef(ref: string): string {
  return ref.trim().toUpperCase().replace(/\s+/g, "");
}
