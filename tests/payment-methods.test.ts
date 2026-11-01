import { describe, expect, it } from "vitest";
import { looksLikeCredential, paymentMethodStatusCopy } from "@/lib/payment-methods";
import { paymentMethodBindSchema } from "@/lib/validation";

describe("paymentMethodStatusCopy", () => {
  it("distinguishes pending, verified, failed, and unavailable", () => {
    expect(paymentMethodStatusCopy("pending")).toContain("pending");
    expect(paymentMethodStatusCopy("pending")).toContain("Not proof of payment");
    expect(paymentMethodStatusCopy("verified")).toContain("ready");
    expect(paymentMethodStatusCopy("failed")).toContain("failed");
    expect(paymentMethodStatusCopy("unavailable")).toContain("Unavailable");
    expect(paymentMethodStatusCopy("unknown")).toContain("pending");
  });
});

describe("looksLikeCredential", () => {
  it("accepts masked labels", () => {
    expect(looksLikeCredential("Visa •• 4242")).toBe(false);
    expect(looksLikeCredential("MTN •• 123")).toBe(false);
    expect(looksLikeCredential("My card")).toBe(false);
  });
  it("flags full card numbers and secret-shaped labels", () => {
    expect(looksLikeCredential("4111111111111111")).toBe(true);
    expect(looksLikeCredential("4111 1111 1111 1111")).toBe(true);
    expect(looksLikeCredential("pin: 1234")).toBe(true);
    expect(looksLikeCredential("CVV 321")).toBe(true);
  });
});

describe("paymentMethodBindSchema", () => {
  it("accepts a masked binding", () => {
    expect(
      paymentMethodBindSchema.safeParse({ type: "card", displayLabel: "Visa •• 4242" }).success,
    ).toBe(true);
    expect(
      paymentMethodBindSchema.safeParse({ type: "mobile_money", displayLabel: "MTN •• 123", providerRef: "tok_1" })
        .success,
    ).toBe(true);
  });
  it("rejects unknown types, empty labels, and secret labels", () => {
    expect(paymentMethodBindSchema.safeParse({ type: "cash", displayLabel: "x" }).success).toBe(false);
    expect(paymentMethodBindSchema.safeParse({ type: "card", displayLabel: " " }).success).toBe(false);
    expect(paymentMethodBindSchema.safeParse({ type: "card", displayLabel: "pin: 1234" }).success).toBe(false);
  });
});
