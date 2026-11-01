import { describe, expect, it } from "vitest";
import {
  actorFromSession,
  actorMatrix,
  can,
  isActiveActor,
  isEducationActor,
  toAuthRole,
  toCategory,
  toProviderKind,
  type Actor,
  type Capability,
} from "@/lib/roles";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    authRole: "user",
    category: "individual",
    providerKind: null,
    status: "active",
    ...overrides,
  };
}

describe("actor derivation", () => {
  it("maps session users onto actors", () => {
    expect(
      actorFromSession({ id: "u1", role: "provider", category: "provider", status: "active", providerKind: "loan" }),
    ).toEqual({ userId: "u1", authRole: "provider", category: "provider", providerKind: "loan", status: "active" });
  });
  it("treats unknown roles and categories as least-privilege member", () => {
    expect(toAuthRole("group_admin")).toBe("user");
    expect(toAuthRole("")).toBe("user");
    expect(toCategory("startup")).toBe("individual");
    expect(toProviderKind("grant")).toBe(null);
  });
  it("ignores providerKind for non-provider roles", () => {
    const a = actorFromSession({ id: "u1", role: "user", category: "individual", status: "active", providerKind: "loan" });
    expect(a.providerKind).toBe(null);
  });
  it("detects education actors and inactive accounts", () => {
    expect(isEducationActor(actor({ category: "university" }))).toBe(true);
    expect(isEducationActor(actor({ category: "government" }))).toBe(true);
    expect(isEducationActor(actor({ category: "individual" }))).toBe(false);
    expect(isEducationActor(actor({ authRole: "provider", category: "university" }))).toBe(false);
    expect(isActiveActor(actor({ status: "active" }))).toBe(true);
    expect(isActiveActor(actor({ status: "deactivated" }))).toBe(false);
    expect(isActiveActor(actor({ status: "deleted" }))).toBe(false);
  });
});

describe("capability gates", () => {
  const admin = actor({ authRole: "admin" });
  const loan = actor({ authRole: "provider", category: "provider", providerKind: "loan" });
  const support = actor({ authRole: "provider", category: "provider", providerKind: "support" });
  const unset = actor({ authRole: "provider", category: "provider", providerKind: null });
  const member = actor();
  const education = actor({ category: "university" });

  it("admits admin everywhere and denies inactive accounts everywhere", () => {
    const capabilities: Capability[] = [
      "admin.access", "admin.users.manage", "storage.reconcile.read", "provider.queue.read",
      "provider.loan.respond", "provider.support.respond", "org.manage", "group.manage",
      "group.wallet.act", "project.create", "project.edit", "request.create", "request.decide",
      "call.transcript.manage", "wallet.review", "payment.bind",
    ];
    for (const capability of capabilities) {
      expect(can(admin, capability)).toBe(true);
      expect(can(actor({ status: "deactivated" }), capability)).toBe(false);
      expect(can(actor({ authRole: "admin", status: "deleted" }), capability)).toBe(false);
    }
  });

  it("restricts admin-only capabilities", () => {
    for (const capability of ["admin.access", "admin.users.manage", "storage.reconcile.read", "wallet.review"] as Capability[]) {
      expect(can(member, capability)).toBe(false);
      expect(can(loan, capability)).toBe(false);
      expect(can(education, capability)).toBe(false);
    }
  });

  it("scopes provider queues by kind, preserving unset-kind access", () => {
    expect(can(member, "provider.queue.read")).toBe(false);
    expect(can(loan, "provider.queue.read")).toBe(true);
    expect(can(loan, "provider.loan.respond")).toBe(true);
    expect(can(loan, "provider.support.respond")).toBe(false);
    expect(can(support, "provider.support.respond")).toBe(true);
    expect(can(support, "provider.loan.respond")).toBe(false);
    expect(can(unset, "provider.loan.respond")).toBe(true);
    expect(can(unset, "provider.support.respond")).toBe(true);
  });

  it("allows providers to create project workspaces but keeps funding requests requester-only", () => {
    for (const capability of ["request.create", "call.transcript.manage", "payment.bind"] as Capability[]) {
      expect(can(member, capability)).toBe(true);
      expect(can(education, capability)).toBe(true);
    }
    expect(can(member, "project.create")).toBe(true);
    expect(can(education, "project.create")).toBe(true);
    expect(can(loan, "project.create")).toBe(true);
    expect(can(loan, "request.create")).toBe(false);
  });

  it("denies unknown capabilities", () => {
    expect(can(admin, "billing.refund" as Capability)).toBe(false);
  });
});

describe("actorMatrix", () => {
  it("publishes one row per capability with documented notes", () => {
    const matrix = actorMatrix();
    expect(matrix.length).toBe(16);
    const loan = matrix.find((row) => row.capability === "provider.loan.respond");
    expect(loan).toMatchObject({ admin: true, providerLoan: true, providerSupport: false, providerUnset: true, member: false });
    const reconcile = matrix.find((row) => row.capability === "storage.reconcile.read");
    expect(reconcile).toMatchObject({ admin: true, member: false, providerUnset: false });
    expect(matrix.find((row) => row.capability === "project.create")).toMatchObject({ admin: true, providerLoan: true, providerSupport: true, education: true, member: true });
    for (const row of matrix) expect(row.note.trim()).not.toBe("");
  });
});
