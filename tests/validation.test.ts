import { describe, expect, it } from "vitest";
import {
  loginSchema,
  messageSendSchema,
  otpVerifySchema,
  projectSubmitSchema,
  registerSchema,
  shortIdSchema,
  transactionProposalSchema,
} from "@/lib/validation";

describe("shortIdSchema", () => {
  it("accepts valid identifiers", () => {
    expect(shortIdSchema.safeParse("A2WD").success).toBe(true);
  });
  it("rejects lowercase, long, or short values", () => {
    expect(shortIdSchema.safeParse("a2wd").success).toBe(false);
    expect(shortIdSchema.safeParse("ABCDE").success).toBe(false);
    expect(shortIdSchema.safeParse("A2").success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    name: "Jane Doe",
    email: "jane@example.com",
    password: "Secret123",
    confirmPassword: "Secret123",
    phone: "+250788123456",
    country: "Rwanda",
    countryCode: "+250",
    category: "individual",
    acceptPrivacy: true,
    acceptTerms: true,
    acceptAgreement: true,
  } as const;

  it("accepts a complete registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
  it("requires matching passwords", () => {
    expect(
      registerSchema.safeParse({ ...valid, confirmPassword: "Other123" }).success,
    ).toBe(false);
  });
  it("requires all three legal acceptances", () => {
    expect(registerSchema.safeParse({ ...valid, acceptPrivacy: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, acceptAgreement: false }).success).toBe(false);
  });
  it("rejects weak passwords", () => {
    expect(
      registerSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires email and password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
});

describe("otpVerifySchema", () => {
  it("requires a 6-digit code and valid purpose", () => {
    expect(
      otpVerifySchema.safeParse({ email: "a@b.com", code: "123456", purpose: "login" }).success,
    ).toBe(true);
    expect(
      otpVerifySchema.safeParse({ email: "a@b.com", code: "12345", purpose: "login" }).success,
    ).toBe(false);
  });
});

describe("messageSendSchema", () => {
  it("rejects empty bodies", () => {
    expect(
      messageSendSchema.safeParse({ conversationId: "c", body: "  ", clientMessageId: "m" }).success,
    ).toBe(false);
  });
});

describe("projectSubmitSchema", () => {
  it("requires a detailed summary", () => {
    expect(
      projectSubmitSchema.safeParse({ title: "Good title", summary: "Too short" }).success,
    ).toBe(false);
    expect(
      projectSubmitSchema.safeParse({
        title: "Good title",
        summary: "A sufficiently detailed summary of the idea.",
      }).success,
    ).toBe(true);
  });
});

describe("transactionProposalSchema", () => {
  it("accepts valid AI proposals and rejects bad ones", () => {
    expect(
      transactionProposalSchema.safeParse({
        amountMinor: 5000,
        currency: "USD",
        direction: "credit",
      }).success,
    ).toBe(true);
    expect(
      transactionProposalSchema.safeParse({
        amountMinor: -5,
        currency: "USD",
        direction: "credit",
      }).success,
    ).toBe(false);
    expect(
      transactionProposalSchema.safeParse({
        amountMinor: 5000,
        currency: "USDD",
        direction: "credit",
      }).success,
    ).toBe(false);
  });
});
