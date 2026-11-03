import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  ROUTES,
  isPublicAdminAuthPath,
  requiresSessionCookie,
} from "@/lib/routes";
import { adminBootstrapSchema } from "@/lib/validation";

/**
 * Admin gate regression coverage: /admin/login and /admin/register must be
 * reachable as-is (public), while every other /admin/* path still requires a
 * session cookie at the proxy and an admin role in the layout.
 */
describe("admin gate paths", () => {
  it("exposes dedicated admin auth paths", () => {
    expect(ROUTES.adminLogin).toBe("/admin/login");
    expect(ROUTES.adminRegister).toBe("/admin/register");
  });

  it("treats the admin auth pages as public", () => {
    expect(isPublicAdminAuthPath("/admin/login")).toBe(true);
    expect(isPublicAdminAuthPath("/admin/register")).toBe(true);
    expect(PUBLIC_ROUTES.has(ROUTES.adminLogin)).toBe(true);
    expect(PUBLIC_ROUTES.has(ROUTES.adminRegister)).toBe(true);
  });

  it("keeps every other admin path protected", () => {
    const protectedPaths = [
      "/admin",
      "/admin/users",
      "/admin/groups",
      "/admin/projects",
      "/admin/requests",
      "/admin/audit",
      "/admin/settings",
      "/admin/login/extra",
      "/admin/register/extra",
    ];
    for (const path of protectedPaths) {
      expect(isPublicAdminAuthPath(path)).toBe(false);
      expect(requiresSessionCookie(path)).toBe(true);
    }
    // Near-miss prefixes must not be treated as admin paths at all.
    expect(isPublicAdminAuthPath("/administrator")).toBe(false);
    expect(requiresSessionCookie("/administrator")).toBe(false);
  });

  it("does not require a session cookie for the admin auth pages", () => {
    expect(requiresSessionCookie("/admin/login")).toBe(false);
    expect(requiresSessionCookie("/admin/register")).toBe(false);
    expect(requiresSessionCookie("/dashboard")).toBe(true);
  });
});

describe("admin bootstrap validation", () => {
  const valid = {
    name: "Owner Name",
    email: "owner@example.com",
    password: "Str0ngPass1",
    confirmPassword: "Str0ngPass1",
    phone: "+250788000000",
    country: "Rwanda",
    countryCode: "+250",
    acceptPrivacy: true,
    acceptTerms: true,
    acceptAgreement: true,
  };

  it("accepts a complete owner record", () => {
    expect(adminBootstrapSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const parsed = adminBootstrapSchema.safeParse({ ...valid, confirmPassword: "Other1abc" });
    expect(parsed.success).toBe(false);
  });

  it("rejects weak passwords", () => {
    const parsed = adminBootstrapSchema.safeParse({
      ...valid,
      password: "weak",
      confirmPassword: "weak",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing legal acceptance", () => {
    const parsed = adminBootstrapSchema.safeParse({ ...valid, acceptTerms: false });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed calling code", () => {
    const parsed = adminBootstrapSchema.safeParse({ ...valid, countryCode: "250" });
    expect(parsed.success).toBe(false);
  });
});
