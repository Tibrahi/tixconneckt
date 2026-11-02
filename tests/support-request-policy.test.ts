import { describe, expect, it } from "vitest";
import { canTransitionSupportRequest, eligibleSupportRecipient } from "@/lib/support-request-policy";

describe("support recipient eligibility", () => {
  it("routes only active support providers to non-financial requests", () => {
    expect(eligibleSupportRecipient({ providerRole: "provider", providerKind: "support", providerStatus: "active" })).toBe(true);
    expect(eligibleSupportRecipient({ providerRole: "provider", providerKind: "loan", providerStatus: "active" })).toBe(false);
    expect(eligibleSupportRecipient({ providerRole: "provider", providerKind: "support", providerStatus: "deactivated" })).toBe(false);
  });

  it("requires organization verification and provider service compatibility", () => {
    expect(eligibleSupportRecipient({ organizationKind: "university", organizationVerificationStatus: "verified" })).toBe(true);
    expect(eligibleSupportRecipient({ organizationKind: "government", organizationVerificationStatus: "pending" })).toBe(false);
    expect(eligibleSupportRecipient({ organizationKind: "provider", organizationCategory: "loan", organizationVerificationStatus: "verified" })).toBe(false);
    expect(eligibleSupportRecipient({ organizationKind: "provider", organizationCategory: "support", organizationVerificationStatus: "verified" })).toBe(true);
  });
});

describe("support case transitions", () => {
  it("lets a recipient triage, ask for information, accept, and resolve work in order", () => {
    expect(canTransitionSupportRequest("pending", "triage", "recipient")).toBe(true);
    expect(canTransitionSupportRequest("pending", "awaiting_requester", "recipient")).toBe(true);
    expect(canTransitionSupportRequest("triage", "accepted", "recipient")).toBe(true);
    expect(canTransitionSupportRequest("accepted", "resolved", "recipient")).toBe(true);
  });

  it("keeps group approval and requester actions separate from recipient decisions", () => {
    expect(canTransitionSupportRequest("pending_group_approval", "accepted", "recipient")).toBe(false);
    expect(canTransitionSupportRequest("pending", "accepted", "requester")).toBe(false);
    expect(canTransitionSupportRequest("pending", "withdrawn", "requester")).toBe(true);
    expect(canTransitionSupportRequest("resolved", "withdrawn", "requester")).toBe(false);
    expect(canTransitionSupportRequest("accepted", "resolved", "admin")).toBe(true);
  });
});
