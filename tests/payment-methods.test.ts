import { describe, expect, it } from "vitest";
import {
  buildDisplayLabel,
  maskAddress,
  maskPhone,
  validateMethodDetails,
} from "@/lib/payment-method-fields";
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
  it("accepts the listified shape with option and details", () => {
    expect(
      paymentMethodBindSchema.safeParse({
        type: "mobile_money",
        displayLabel: "MTN MoMo +256 ••• 123",
        option: "mtn",
        details: { provider: "MTN", country: "UG", phone: "+256771234567", accountName: "Ama" },
      }).success,
    ).toBe(true);
  });
  it("rejects unknown types, empty labels, and secret labels", () => {
    expect(paymentMethodBindSchema.safeParse({ type: "cash", displayLabel: "x" }).success).toBe(false);
    expect(paymentMethodBindSchema.safeParse({ type: "card", displayLabel: " " }).success).toBe(false);
    expect(paymentMethodBindSchema.safeParse({ type: "card", displayLabel: "pin: 1234" }).success).toBe(false);
    expect(
      paymentMethodBindSchema.safeParse({ type: "card", displayLabel: "Visa •• 4242", option: "paypal" }).success,
    ).toBe(false);
  });
});

describe("validateMethodDetails", () => {
  const nextYear = String(new Date().getFullYear() + 1);

  it("validates Visa/Mastercard public fields and normalizes the brand", () => {
    const out = validateMethodDetails("visa", {
      brand: "Visa",
      holderName: "AMA SERWAA",
      last4: "4242",
      expMonth: "8",
      expYear: nextYear,
    });
    expect(out.ok).toBe(true);
    expect(out.normalized.brand).toBe("Visa");
    expect(buildDisplayLabel("visa", out.normalized)).toBe(`Visa •• 4242 · 08/${nextYear.slice(-2)}`);
  });

  it("rejects short last4, expired cards, and smuggled PANs", () => {
    const short = validateMethodDetails("mastercard", {
      brand: "Mastercard",
      holderName: "Ben",
      last4: "42",
      expMonth: "1",
      expYear: nextYear,
    });
    expect(short.ok).toBe(false);
    const expired = validateMethodDetails("visa", {
      brand: "Visa",
      holderName: "Ben",
      last4: "4242",
      expMonth: "1",
      expYear: String(new Date().getFullYear() - 1),
    });
    expect(expired.ok).toBe(false);
    const pan = validateMethodDetails("visa", {
      brand: "Visa",
      holderName: "4111 1111 1111 1111",
      last4: "4242",
      expMonth: "1",
      expYear: nextYear,
    });
    expect(pan.ok).toBe(false);
    expect(pan.errors[0]).toContain("full card number");
  });

  it("validates MTN MoMo per country phone rules and normalizes to E.164", () => {
    const out = validateMethodDetails("mtn", {
      provider: "MTN",
      country: "UG",
      phone: "771234567",
      accountName: "Ama Serwaa",
    });
    expect(out.ok).toBe(true);
    expect(out.normalized.phone).toBe("+256771234567");
    expect(buildDisplayLabel("mtn", out.normalized)).toContain("MTN MoMo +256 ••• 567");
  });

  it("rejects unsupported countries, invalid phones, and PINs for MoMo", () => {
    const wrongCountry = validateMethodDetails("mtn", {
      provider: "MTN",
      country: "KE",
      phone: "+254722123456",
      accountName: "Ama",
    });
    expect(wrongCountry.ok).toBe(false);
    const badPhone = validateMethodDetails("airtel", {
      provider: "Airtel",
      country: "KE",
      phone: "123",
      accountName: "Ama",
    });
    expect(badPhone.ok).toBe(false);
    const pin = validateMethodDetails("mtn", {
      provider: "MTN",
      country: "UG",
      phone: "pin: 1234",
      accountName: "Ama",
    });
    expect(pin.ok).toBe(false);
  });

  it("validates crypto addresses per coin and blocks seed phrases", () => {
    const btc = validateMethodDetails("crypto", {
      coin: "BTC",
      network: "Bitcoin",
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    });
    expect(btc.ok).toBe(true);
    expect(buildDisplayLabel("crypto", btc.normalized)).toBe("BTC · bc1q…f3t4 (Bitcoin)");
    const badEth = validateMethodDetails("crypto", { coin: "ETH", network: "Ethereum", address: "0x123" });
    expect(badEth.ok).toBe(false);
    const seed = validateMethodDetails("crypto", {
      coin: "BTC",
      network: "Bitcoin",
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      memo: "word ".repeat(13).trim(),
    });
    expect(seed.ok).toBe(false);
  });

  it("rejects forbidden detail keys outright", () => {
    const out = validateMethodDetails("visa", {
      brand: "Visa",
      holderName: "Ama",
      last4: "4242",
      expMonth: "1",
      expYear: nextYear,
      cvv: "123",
    });
    expect(out.ok).toBe(false);
  });

  it("masks phones and addresses for display", () => {
    expect(maskPhone("+256771234567")).toBe("+256 ••• 567");
    expect(maskAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe("bc1q…f3t4");
  });
});
