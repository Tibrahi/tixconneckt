import { describe, expect, it } from "vitest";
import { sanitizeHtml, toSafeText } from "@/lib/sanitize";
import { formatDateTime, formatMoney } from "@/lib/currency";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalizes national-format numbers using the selected ISO country", () => {
    expect(normalizePhone("0788123456", "RW")).toMatchObject({
      e164: "+250788123456",
      callingCode: "+250",
      valid: true,
    });
  });
});

describe("sanitizeHtml", () => {
  it("strips scripts and disallowed tags", () => {
    const out = sanitizeHtml('<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(out).toContain("Hello");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
  });
  it("keeps safe formatting", () => {
    const out = sanitizeHtml("<b>Bold</b> and <a href=\"https://example.com\">link</a>");
    expect(out).toContain("<b>Bold</b>");
    expect(out).toContain("example.com");
  });
});

describe("toSafeText", () => {
  it("removes control characters and caps length", () => {
    expect(toSafeText("a\u0000b", 10)).toBe("ab");
    expect(toSafeText(123 as unknown as string)).toBe("");
    expect(toSafeText("abcdef", 3)).toBe("abc");
  });
});

describe("formatMoney", () => {
  it("formats minor units with Intl", () => {
    expect(formatMoney(5000, "USD", "en-US")).toBe("$50.00");
    expect(formatMoney(0, "USD", "en-US")).toBe("$0.00");
  });
});

describe("formatDateTime", () => {
  it("formats with timezone", () => {
    const out = formatDateTime("2026-01-01T12:00:00.000Z", "UTC", "en-US");
    expect(out).toContain("2026");
  });
});
