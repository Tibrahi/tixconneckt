import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionResultEmail,
  activationEmail,
  depositDecisionEmail,
  escapeHtml,
  evidenceRequestEmail,
  isTransientSmtpError,
  notificationEmail,
  otpEmail,
  passwordChangedEmail,
  securityAlertEmail,
  sendEmail,
  upcomingActionEmail,
  validateRecipient,
  withdrawalEmail,
  type BuiltEmail,
} from "@/lib/email";

const BUILDERS: Array<[string, () => BuiltEmail]> = [
  ["otp", () => otpEmail("123456", "login")],
  ["activation", () => activationEmail("Alice")],
  ["securityAlert", () => securityAlertEmail("New device sign-in", "Details here.")],
  ["passwordChanged", () => passwordChangedEmail("Alice")],
  [
    "depositDecision",
    () =>
      depositDecisionEmail({
        memberName: "Alice",
        amountMinor: 5000,
        currency: "RWF",
        status: "credited",
        reference: "TX-1",
        reason: "Verified",
      }),
  ],
  [
    "evidenceRequest",
    () =>
      evidenceRequestEmail({
        memberName: "Alice",
        amountMinor: 5000,
        currency: "RWF",
        status: "needs_evidence",
        reference: "TX-2",
        reason: "Need reference",
      }),
  ],
  ["actionResult", () => actionResultEmail({ title: "Standup", outcome: "completed", detail: "Done." })],
  [
    "withdrawal",
    () =>
      withdrawalEmail({
        memberName: "Alice",
        amountMinor: 5000,
        currency: "RWF",
        status: "completed",
        reference: "TX-3",
      }),
  ],
  ["upcomingAction", () => upcomingActionEmail({ title: "Standup", when: "tomorrow 09:00" })],
  ["notification", () => notificationEmail({ title: "Hello", body: "World" })],
];

describe("email design system", () => {
  it("gives every email a subject, text, and branded HTML shell", () => {
    for (const [name, build] of BUILDERS) {
      const email = build();
      expect(email.subject.length, `${name} subject`).toBeGreaterThan(0);
      expect(email.text.length, `${name} text`).toBeGreaterThan(0);
      expect(email.html, `${name} html`).toContain("<!doctype html>");
      expect(email.html, `${name} brand`).toContain("TIXCONNECKT");
      expect(email.html, `${name} footer`).toContain("All rights reserved");
      expect(email.html, `${name} table layout`).toContain("<table");
      expect(email.html, `${name} no external CSS`).not.toContain("<link");
      expect(email.html, `${name} no script`).not.toContain("<script");
    }
  });

  it("escapes dynamic values in HTML", () => {
    const evil = '<img src=x onerror="alert(1)">';
    expect(escapeHtml(evil)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(activationEmail(evil).html).not.toContain("<img src=x");
    expect(activationEmail(evil).html).toContain("&lt;img src=x");
    expect(securityAlertEmail(evil, evil).html).not.toContain(evil);
    expect(
      depositDecisionEmail({
        memberName: evil,
        amountMinor: 1,
        currency: "RWF",
        status: "rejected",
        reference: "TX-9",
        reason: evil,
      }).html,
    ).not.toContain(evil);
  });

  it("renders logo and absolute links only for https app URLs", () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    try {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      const prod = activationEmail("Alice").html;
      expect(prod).toContain('src="https://app.example.com/logo.png"');
      expect(prod).toContain('href="https://app.example.com/login"');
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      const dev = activationEmail("Alice").html;
      expect(dev).not.toContain("localhost");
      expect(dev).not.toContain("/logo.png");
      expect(dev).toContain("TIXCONNECKT");
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = saved;
    }
  });

  it("keeps operational tokens in text versions", () => {
    const wallet = { memberName: "Alice", amountMinor: 5000, currency: "RWF", reference: "TX-2026-ABCDEF" };
    expect(depositDecisionEmail({ ...wallet, status: "credited" }).text).toContain("TX-2026-ABCDEF");
    expect(evidenceRequestEmail({ ...wallet, status: "needs_evidence", reason: "Need reference" }).text).toContain(
      "Need reference",
    );
    expect(otpEmail("654321", "recovery").text).toContain("654321");
  });
});

describe("validateRecipient", () => {
  it("accepts normal addresses and rejects malformed or injected ones", () => {
    expect(validateRecipient("user@example.com")).toBeNull();
    expect(validateRecipient("not-an-email")).not.toBeNull();
    expect(validateRecipient("")).not.toBeNull();
    expect(validateRecipient("a@b.com\r\nBcc: x@y.com")).not.toBeNull();
  });
});

describe("isTransientSmtpError", () => {
  it("flags 4xx responses and timeout resets, not permanent failures", () => {
    expect(isTransientSmtpError({ responseCode: 421 })).toBe(true);
    expect(isTransientSmtpError({ responseCode: 550 })).toBe(false);
    expect(isTransientSmtpError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientSmtpError({ code: "EAUTH" })).toBe(false);
    expect(isTransientSmtpError(null)).toBe(false);
  });
});

describe("sendEmail", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env.SMTP_USER = saved.SMTP_USER;
    process.env.SMTP_PASS = saved.SMTP_PASS;
    if (saved.SMTP_USER === undefined) delete process.env.SMTP_USER;
    if (saved.SMTP_PASS === undefined) delete process.env.SMTP_PASS;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records pending (never fake-sent) when SMTP is not configured", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await sendEmail({ to: "user@example.com", subject: "Hi", text: "Hello" });
    expect(result).toEqual({ sent: false, pendingReason: "SMTP is not configured" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rejects bad recipients and injected subjects without sending", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    await expect(sendEmail({ to: "bad", subject: "Hi", text: "x" })).resolves.toEqual({
      sent: false,
      error: "Invalid recipient address.",
    });
    await expect(sendEmail({ to: "u@e.com", subject: "Hi\r\nBcc: x", text: "x" })).resolves.toEqual({
      sent: false,
      error: "Invalid subject.",
    });
  });
});
