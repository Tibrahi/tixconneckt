import { describe, expect, it } from "vitest";
import {
  connectionRequestSchema,
  loginSchema,
  messageSendSchema,
  normalizeProfileProposal,
  otpVerifySchema,
  profileProposalSchema,
  profileUpdateSchema,
  projectInterestCopy,
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

describe("connectionRequestSchema", () => {
  it("accepts a plain request and one with project-interest context", () => {
    expect(connectionRequestSchema.safeParse({ shortId: "A2WD" }).success).toBe(true);
    expect(
      connectionRequestSchema.safeParse({
        shortId: "A2WD",
        projectId: "123e4567-e89b-12d3-a456-426614174000",
      }).success,
    ).toBe(true);
  });
  it("rejects invalid identifiers and non-uuid project ids", () => {
    expect(connectionRequestSchema.safeParse({ shortId: "a2wd" }).success).toBe(false);
    expect(
      connectionRequestSchema.safeParse({ shortId: "A2WD", projectId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("projectInterestCopy", () => {
  it("names only the requester and the public project title", () => {
    const copy = projectInterestCopy("Jane Doe", "Solar Kiosks");
    expect(copy.title).toBe("Interest in your project");
    expect(copy.body).toContain("Jane Doe");
    expect(copy.body).toContain("Solar Kiosks");
    expect(copy.body).not.toContain("@");
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

describe("profileUpdateSchema countryCode", () => {
  // Registration stores calling codes (+250); the profile form uses ISO (RW).
  // Both must save, or existing accounts hit PATCH /api/profile 400.
  it("accepts ISO letters, calling codes, and empty", () => {
    expect(profileUpdateSchema.safeParse({ countryCode: "RW" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ countryCode: "rw" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ countryCode: "+250" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ countryCode: "" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });
  it("accepts the same country code values in AI proposals", () => {
    expect(profileProposalSchema.safeParse({ countryCode: "RW" }).success).toBe(true);
    expect(profileProposalSchema.safeParse({ countryCode: "+250" }).success).toBe(true);
    expect(profileProposalSchema.safeParse({ countryCode: "" }).success).toBe(true);
    expect(profileProposalSchema.safeParse({ countryCode: "R2" }).success).toBe(false);
  });
  it("rejects malformed codes", () => {
    expect(profileUpdateSchema.safeParse({ countryCode: "R2" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ countryCode: "RWANDA" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ countryCode: "250" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ countryCode: "+250123" }).success).toBe(false);
  });
});

describe("profileUpdateSchema githubUrl", () => {
  it("accepts empty and valid GitHub profile URLs", () => {
    expect(profileUpdateSchema.safeParse({ githubUrl: "" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com/octocat" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com/octocat/" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com/a-b-1" }).success).toBe(true);
  });
  it("rejects non-profile URLs and lookalikes", () => {
    expect(profileUpdateSchema.safeParse({ githubUrl: "http://github.com/octocat" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com/octocat/repo" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com.evil.com/octocat" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ githubUrl: "https://github.com/-bad" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ githubUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ githubUrl: "octocat" }).success).toBe(false);
  });
});

describe("normalizeProfileProposal", () => {
  it("keeps country, location, phone, and country code in distinct fields", () => {
    expect(normalizeProfileProposal({ country: "Rwanda", location: "Kigali", phone: "+250788123456", countryCode: "+250" })).toEqual({
      phone: "+250788123456",
      country: "Rwanda",
      countryCode: "+250",
      location: "Kigali",
    });
  });
  it("maps aliases onto canonical fields", () => {
    expect(
      normalizeProfileProposal({
        education: "BSc Computer Science",
        goals: "Find collaborators",
        technicalSkills: ["React", "SQL"],
        sectors: "agritech, fintech",
        about: "Builder in Kigali",
        city: "Kigali",
      }),
    ).toEqual({
      educationLevel: "BSc Computer Science",
      objectives: "Find collaborators",
      skills: ["React", "SQL"],
      fields: ["agritech", "fintech"],
      bio: "Builder in Kigali",
      location: "Kigali",
    });
  });
  it("unwraps one level of nesting", () => {
    expect(normalizeProfileProposal({ profile: { major: "CS", bio: "Hi" } })).toEqual({
      major: "CS",
      bio: "Hi",
    });
  });
  it("fills gaps from a wrapper when top-level fields exist", () => {
    expect(normalizeProfileProposal({ bio: "Top", profile: { major: "CS" } })).toEqual({
      bio: "Top",
      major: "CS",
    });
  });
  it("drops empty values and ignores unknown keys", () => {
    expect(normalizeProfileProposal({ bio: "  ", skills: "", hacker: "x", major: "CS" })).toEqual({
      major: "CS",
    });
  });
  it("returns empty for non-objects", () => {
    expect(normalizeProfileProposal(null)).toEqual({});
    expect(normalizeProfileProposal("text")).toEqual({});
    expect(normalizeProfileProposal([{ bio: "x" }])).toEqual({});
  });
  it("normalized output passes the proposal schema", () => {
    const normalized = normalizeProfileProposal({ goals: "Ship it", technicalSkills: "a, b" });
    expect(profileProposalSchema.safeParse(normalized).success).toBe(true);
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
