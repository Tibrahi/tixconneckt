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
  const validated = transactionProposalSchema.safeParse(raw);
  if (!validated.success) {
    return { ok: false, error: "The extracted data was invalid. Correct the values manually instead." };
  }
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (KNOWN_TX_KEYS.has(key)) continue;
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
