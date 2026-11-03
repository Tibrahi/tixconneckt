import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_PERSONAS,
  demoLabelForUser,
  demoModeEnabled,
  getDemoPersona,
  isDemoEmail,
  type DemoPersonaKey,
} from "@/lib/demo";

describe("open demo mode", () => {
  it("offers one persona per role", () => {
    const keys = DEMO_PERSONAS.map((p) => p.key).sort();
    expect(keys).toEqual(
      ["government", "individual", "provider-loan", "provider-support", "university"].sort(),
    );
  });

  it("maps each persona to the real role, category, and start page", () => {
    const expected: Record<DemoPersonaKey, { role: string; category: string; providerKind: string | null; redirectTo: string }> = {
      individual: { role: "user", category: "individual", providerKind: null, redirectTo: "/dashboard" },
      university: { role: "user", category: "university", providerKind: null, redirectTo: "/dashboard" },
      government: { role: "user", category: "government", providerKind: null, redirectTo: "/dashboard" },
      "provider-loan": { role: "provider", category: "provider", providerKind: "loan", redirectTo: "/dashboard" },
      "provider-support": { role: "provider", category: "provider", providerKind: "support", redirectTo: "/dashboard" },
    };
    for (const persona of DEMO_PERSONAS) {
      expect(getDemoPersona(persona.key)).toBeDefined();
      expect({
        role: persona.role,
        category: persona.category,
        providerKind: persona.providerKind,
        redirectTo: persona.redirectTo,
      }).toEqual(expected[persona.key]);
      expect(isDemoEmail(persona.email)).toBe(true);
    }
    expect(getDemoPersona("owner")).toBeUndefined();
  });

  it("recognizes only demo addresses", () => {
    expect(isDemoEmail("demo-individual@tixconneckt.demo")).toBe(true);
    expect(isDemoEmail("owner@example.com")).toBe(false);
    expect(isDemoEmail("demo-individual@tixconneckt.demo.evil.com")).toBe(false);
  });

  it("labels demo sessions per role and ignores real accounts", () => {
    expect(demoLabelForUser({ email: "demo-provider-loan@tixconneckt.demo", name: "Demo Provider", role: "provider", category: "provider", providerKind: "loan" })).toBe("Demo Provider · Loan Provider");
    expect(demoLabelForUser({ email: "demo-university@tixconneckt.demo", name: "Demo University", role: "user", category: "university", providerKind: null })).toBe("Demo University · University");
    expect(demoLabelForUser({ email: "owner@example.com", name: "Owner", role: "admin", category: "individual", providerKind: null })).toBeNull();
  });

  describe("demoModeEnabled", () => {
    const previous = process.env.DEMO_MODE;
    afterEach(() => {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    });

    it("is open by default and honors the kill switch", () => {
      delete process.env.DEMO_MODE;
      expect(demoModeEnabled()).toBe(true);
      process.env.DEMO_MODE = "false";
      expect(demoModeEnabled()).toBe(false);
      process.env.DEMO_MODE = "true";
      expect(demoModeEnabled()).toBe(true);
    });
  });
});
