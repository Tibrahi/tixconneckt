import { describe, expect, it } from "vitest";
import { normalizeExtraction, splitExtraction } from "@/lib/proof";

describe("splitExtraction", () => {
  it("passes canonical transactions through", () => {
    const result = splitExtraction({ amountMinor: 5000, currency: "USD", direction: "credit" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tx).toMatchObject({ amountMinor: 5000, currency: "USD", direction: "credit" });
      expect(result.value.extra).toEqual({});
    }
  });

  it("unwraps a nested transaction", () => {
    const result = splitExtraction({
      transaction: { amountMinor: 1500, currency: "RWF", direction: "debit", reference: "ABC123" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tx).toMatchObject({ amountMinor: 1500, currency: "RWF", direction: "debit" });
    }
  });

  it("resolves documented aliases", () => {
    const result = splitExtraction({
      amount: 2500,
      currencyCode: "usd",
      type: "incoming",
      txnRef: "TX-9",
      payer: "Jane",
      payee: "Moto Shop",
      network: "MTN",
      status: "completed",
      narrative: "Spare parts",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tx).toMatchObject({
        amountMinor: 2500,
        currency: "USD",
        direction: "credit",
        reference: "TX-9",
        sender: "Jane",
        recipient: "Moto Shop",
        provider: "MTN",
        paymentStatus: "completed",
        description: "Spare parts",
      });
      // Consumed aliases are not duplicated into extras.
      expect(result.value.extra).toEqual({});
    }
  });

  it("coerces decorated amounts to minor units", () => {
    expect(normalizeExtraction({ amount: "$50.00" })).toMatchObject({ amountMinor: 5000 });
    expect(normalizeExtraction({ amount: "1,500 RWF" })).toMatchObject({ amountMinor: 150000 });
    expect(normalizeExtraction({ amount: 50.5 })).toMatchObject({ amountMinor: 5050 });
    // Plain integers follow the documented contract: already minor units.
    expect(normalizeExtraction({ amountMinor: 5000 })).toMatchObject({ amountMinor: 5000 });
    expect(normalizeExtraction({ amountMinor: "5000" })).toMatchObject({ amountMinor: 5000 });
  });

  it("maps direction synonyms and normalizes currency, date, and confidence", () => {
    const normalized = normalizeExtraction({
      direction: "outgoing",
      currency: "rwf",
      date: "2026-10-30",
      confidence: 85,
    });
    expect(normalized.direction).toBe("debit");
    expect(normalized.currency).toBe("RWF");
    expect(typeof normalized.occurredAt).toBe("string");
    expect(new Date(normalized.occurredAt as string).getTime()).not.toBeNaN();
    expect(normalized.extractionConfidence).toBe(0.85);
  });

  it("names the failing fields instead of a bare invalid error", () => {
    const result = splitExtraction({ currency: "TOOLONG", direction: "sideways" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("amountMinor");
      expect(result.error).toContain("currency");
      expect(result.error).toContain("direction");
      expect(result.error).toContain("manually");
    }
  });

  it("rejects non-objects and keeps unknown fields in extras", () => {
    expect(splitExtraction([1, 2]).ok).toBe(false);
    expect(splitExtraction(null).ok).toBe(false);
    const result = splitExtraction({
      amountMinor: 100,
      currency: "USD",
      direction: "credit",
      agentName: "Kiosk 4",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.extra).toEqual({ agentName: "Kiosk 4" });
  });
});
