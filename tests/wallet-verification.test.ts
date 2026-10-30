import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSupportedCurrency, normalizeCurrency, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { depositDecisionEmail, evidenceRequestEmail, withdrawalEmail } from "@/lib/email";
import {
  extractionCompleteness,
  normalizeProviderRef,
  splitExtraction,
} from "@/lib/proof";
import { verifyCallbackSignature } from "@/lib/tixlpay";
import {
  accountSettingsSchema,
  EXTRACTION_CONFIDENCE_THRESHOLD,
  individualWithdrawalSchema,
  manualCreditSchema,
  reviewDecisionSchema,
  transactionProposalSchema,
} from "@/lib/validation";

describe("transactionProposalSchema (wallet.md FR-02)", () => {
  it("accepts the full extracted field set", () => {
    const result = transactionProposalSchema.safeParse({
      amountMinor: 50000,
      currency: "RWF",
      direction: "credit",
      reference: "MOMO-123",
      sender: "Alice",
      recipient: "TixConneckt",
      provider: "MTN MoMo",
      paymentStatus: "completed",
      occurredAt: "2026-10-24T10:00:00.000Z",
      extractionConfidence: 0.92,
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a minimal legacy proposal", () => {
    expect(
      transactionProposalSchema.safeParse({
        amountMinor: 5000,
        currency: "USD",
        direction: "credit",
      }).success,
    ).toBe(true);
  });

  it("rejects out-of-range confidence", () => {
    const base = { amountMinor: 5000, currency: "USD", direction: "credit" } as const;
    expect(
      transactionProposalSchema.safeParse({ ...base, extractionConfidence: 1.5 }).success,
    ).toBe(false);
    expect(
      transactionProposalSchema.safeParse({ ...base, extractionConfidence: -0.1 }).success,
    ).toBe(false);
  });
});

describe("splitExtraction", () => {
  it("splits transaction fields from preserved extras", () => {
    const result = splitExtraction({
      amountMinor: 50000,
      currency: "RWF",
      direction: "credit",
      sender: "Alice",
      momoCode: "ABC123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tx.sender).toBe("Alice");
    expect(result.value.extra).toEqual({ momoCode: "ABC123" });
  });

  it("rejects non-objects and invalid proposals", () => {
    expect(splitExtraction(null).ok).toBe(false);
    expect(splitExtraction([{ amountMinor: 1 }]).ok).toBe(false);
    expect(
      splitExtraction({ amountMinor: -5, currency: "USD", direction: "credit" }).ok,
    ).toBe(false);
  });

  it("drops reserved extra keys instead of trusting them", () => {
    const result = splitExtraction({
      amountMinor: 100,
      currency: "USD",
      direction: "credit",
      __proto__: { polluted: true },
      note: "ok",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extra).toEqual({ note: "ok" });
  });
});

describe("extractionCompleteness (wallet.md FR-03)", () => {
  const full = {
    amountMinor: 100,
    currency: "RWF",
    direction: "credit",
    reference: "REF-1",
    sender: "Alice",
    provider: "MTN",
    extractionConfidence: 0.9,
  } as const;

  it("marks complete extractions", () => {
    expect(extractionCompleteness({ ...full }).complete).toBe(true);
  });

  it("lists missing verification fields", () => {
    const result = extractionCompleteness({
      amountMinor: 100,
      currency: "RWF",
      direction: "credit",
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["reference", "sender", "provider"]));
  });

  it("flags low confidence for manual review", () => {
    const result = extractionCompleteness({ ...full, extractionConfidence: 0.2 });
    expect(result.lowConfidence).toBe(true);
    expect(result.complete).toBe(false);
    expect(EXTRACTION_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

describe("normalizeProviderRef", () => {
  it("normalizes references for duplicate detection", () => {
    expect(normalizeProviderRef("  momo 123 abc ")).toBe("MOMO123ABC");
  });
});

describe("supported currencies (wallet.md FR-03)", () => {
  it("supports RWF and normalizes case", () => {
    expect(SUPPORTED_CURRENCIES).toContain("RWF");
    expect(isSupportedCurrency("rwf")).toBe(true);
    expect(normalizeCurrency(" usd ")).toBe("USD");
  });

  it("rejects unknown currencies", () => {
    expect(isSupportedCurrency("XXX")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
  });
});

describe("accountSettingsSchema (wallet.md FR-06)", () => {
  it("accepts a full configuration", () => {
    expect(
      accountSettingsSchema.safeParse({
        savingsTargetMinor: 50000000,
        minContributionMinor: 1000,
        maxContributionMinor: 100000,
        minWithdrawalMinor: 5000,
        startDate: "2026-01-01T00:00:00.000Z",
        targetDate: "2026-12-31T00:00:00.000Z",
        frequency: "monthly",
        withdrawalRules: { cooldownDays: 7 },
        notifyEmail: true,
        notifyInApp: false,
        visibility: "private",
      }).success,
    ).toBe(true);
  });

  it("keeps minimum contribution below maximum contribution", () => {
    const result = accountSettingsSchema.safeParse({
      minContributionMinor: 5000,
      maxContributionMinor: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("keeps start date before target date", () => {
    const result = accountSettingsSchema.safeParse({
      startDate: "2026-12-31T00:00:00.000Z",
      targetDate: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("treats target and limits as independent optional rules", () => {
    const result = accountSettingsSchema.safeParse({
      savingsTargetMinor: 100000,
      minContributionMinor: 200000,
    });
    // A high minimum next to a lower target is allowed: they govern
    // different things (per-transaction floor vs. savings goal).
    expect(result.success).toBe(true);
  });
});

describe("reviewDecisionSchema (wallet.md FR-04)", () => {
  it("requires a reason to reject", () => {
    expect(
      reviewDecisionSchema.safeParse({ entryId: "e1", decision: "rejected" }).success,
    ).toBe(false);
    expect(
      reviewDecisionSchema.safeParse({ entryId: "e1", decision: "rejected", reason: "Blurry receipt" }).success,
    ).toBe(true);
  });

  it("requires a note to request evidence", () => {
    expect(
      reviewDecisionSchema.safeParse({ entryId: "e1", decision: "needs_evidence" }).success,
    ).toBe(false);
    expect(
      reviewDecisionSchema.safeParse({ entryId: "e1", decision: "needs_evidence", reason: "Need the reference" }).success,
    ).toBe(true);
  });

  it("allows approval without a note", () => {
    expect(
      reviewDecisionSchema.safeParse({ entryId: "e1", decision: "approved" }).success,
    ).toBe(true);
  });
});

describe("manualCreditSchema", () => {
  it("requires verified values and a verification note", () => {
    const verified = { amountMinor: 1000, currency: "RWF", direction: "credit" } as const;
    expect(
      manualCreditSchema.safeParse({ parsingJobId: "j1", verified, reason: "Checked the stamped receipt" }).success,
    ).toBe(true);
    expect(
      manualCreditSchema.safeParse({ parsingJobId: "j1", verified, reason: "no" }).success,
    ).toBe(false);
  });
});

describe("individualWithdrawalSchema (wallet.md FR-08)", () => {
  it("requires a positive amount and short idempotency keys are rejected", () => {
    expect(
      individualWithdrawalSchema.safeParse({ amountMinor: 1000, currency: "RWF" }).success,
    ).toBe(true);
    expect(
      individualWithdrawalSchema.safeParse({ amountMinor: 0, currency: "RWF" }).success,
    ).toBe(false);
    expect(
      individualWithdrawalSchema.safeParse({ amountMinor: 1000, currency: "RWF", idempotencyKey: "short" }).success,
    ).toBe(false);
  });
});

describe("verifyCallbackSignature (wallet.md §5)", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ providerReference: "P-1", status: "completed" });
  const valid = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const last = valid.slice(-1);
  const tampered = `${valid.slice(0, -1)}${last === "0" ? "1" : "0"}`;

  it("accepts a valid signature and rejects anything else", () => {
    process.env.TIXLPAY_WEBHOOK_SECRET = secret;
    expect(verifyCallbackSignature(body, valid)).toBe(true);
    expect(verifyCallbackSignature(body, tampered)).toBe(false);
    expect(verifyCallbackSignature(`${body} `, valid)).toBe(false);
    expect(verifyCallbackSignature(body, null)).toBe(false);
    expect(verifyCallbackSignature(body, "not-hex!!")).toBe(false);
    delete process.env.TIXLPAY_WEBHOOK_SECRET;
    expect(verifyCallbackSignature(body, valid)).toBe(false);
  });
});

describe("wallet emails carry only member, amount, status, reference (wallet.md §5)", () => {
  const input = {
    memberName: "Alice",
    amountMinor: 50000,
    currency: "RWF",
    reference: "TX-2026-ABCDEF",
  };

  it("covers approval and rejection with reason", () => {
    const approved = depositDecisionEmail({ ...input, status: "credited" });
    expect(approved.text).toContain("Alice");
    expect(approved.text).toContain("TX-2026-ABCDEF");
    expect(approved.subject).toContain("approved");

    const rejected = depositDecisionEmail({ ...input, status: "rejected", reason: "Unreadable proof" });
    expect(rejected.text).toContain("Unreadable proof");
  });

  it("covers evidence requests and withdrawals without extra sensitive data", () => {
    const evidence = evidenceRequestEmail({ ...input, status: "needs_evidence", reason: "Need reference" });
    expect(evidence.text).toContain("Need reference");

    const withdrawal = withdrawalEmail({ ...input, status: "completed" });
    for (const field of ["Alice", "TX-2026-ABCDEF", "completed"]) {
      expect(withdrawal.text).toContain(field);
    }
    for (const leaked of ["account number", "bank", "password", "identity"]) {
      expect(withdrawal.text.toLowerCase()).not.toContain(leaked);
    }
  });
});
