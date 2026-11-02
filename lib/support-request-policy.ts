export type SupportStatus =
  | "pending_group_approval"
  | "pending"
  | "triage"
  | "awaiting_requester"
  | "accepted"
  | "declined"
  | "resolved"
  | "withdrawn";

export type SupportActor = "requester" | "recipient" | "admin";

export function eligibleSupportRecipient(input: {
  providerRole?: string | null;
  providerKind?: string | null;
  providerStatus?: string | null;
  organizationKind?: string | null;
  organizationCategory?: string | null;
  organizationVerificationStatus?: string | null;
}): boolean {
  if (input.providerRole !== undefined) {
    return input.providerRole === "provider" && input.providerKind === "support" && input.providerStatus === "active";
  }
  if (input.organizationVerificationStatus !== "verified") return false;
  if (input.organizationKind === "university" || input.organizationKind === "government") return true;
  return input.organizationKind === "provider" && input.organizationCategory === "support";
}

const recipientTransitions: Partial<Record<SupportStatus, readonly SupportStatus[]>> = {
  pending: ["triage", "awaiting_requester", "accepted", "declined"],
  triage: ["awaiting_requester", "accepted", "declined", "resolved"],
  awaiting_requester: ["triage", "accepted", "declined"],
  accepted: ["awaiting_requester", "resolved", "declined"],
};

export function canTransitionSupportRequest(current: SupportStatus, next: SupportStatus, actor: SupportActor): boolean {
  if (next === "withdrawn") return (actor === "requester" || actor === "admin") && !["declined", "resolved", "withdrawn"].includes(current);
  if (actor !== "recipient" && actor !== "admin") return false;
  return recipientTransitions[current]?.includes(next) ?? false;
}
