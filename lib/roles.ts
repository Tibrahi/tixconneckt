import { apiError } from "./api-response";
import { getSession } from "./session";

/**
 * Actor/action/resource matrix (role-aware spec §C1).
 *
 * Derived from inspected code — registration (`app/api/auth/register`),
 * `users.role` / `users.category` / `users.providerKind`, group/project/
 * conversation memberships, provider links, and every route guard:
 *
 * - Auth roles (`users.role`): `user` (default, includes individual,
 *   university, and government categories), `provider` (registered with
 *   category=provider), `admin` (assigned out-of-band). `group_admin` exists
 *   only as a schema comment — group adminship is per-group membership.
 * - Category (`users.category`): individual | university | government |
 *   provider. University/government carry NO distinct authorization today;
 *   they share member access plus organization workflows.
 * - Provider kind (`users.providerKind`): loan | support | null. It determines
 *   the provider's queue and response workflow; it does not change which
 *   requester-owned projects they may access.
 *
 * Migration rule (§C3): existing users keep their current access. New
 * capabilities deny by default; any future kind- or category-scoped
 * restriction must be added here explicitly with tests, never inferred
 * from a display label.
 */

export type AuthRole = "user" | "provider" | "admin";

export type AccountCategory = "individual" | "university" | "government" | "provider";

export type ProviderKind = "loan" | "support" | null;

/** The acting account, resolved server-side per request. */
export interface Actor {
  userId: string;
  authRole: AuthRole;
  category: AccountCategory;
  providerKind: ProviderKind;
  status: string;
}

/**
 * Capabilities enforced through this module. Resource-scoped entries
 * (owner/member/participant) are checked by the owning route with the
 * actor's identity — the matrix decides the role gate, the route decides
 * the resource relationship.
 */
export type Capability =
  | "admin.access"
  | "admin.users.manage"
  | "storage.reconcile.read"
  | "provider.queue.read"
  | "provider.loan.respond"
  | "provider.support.respond"
  | "org.manage"
  | "group.manage"
  | "group.wallet.act"
  | "project.create"
  | "project.edit"
  | "request.create"
  | "request.decide"
  | "call.transcript.manage"
  | "wallet.review"
  | "payment.bind";

export function toAuthRole(role: string): AuthRole {
  return role === "admin" || role === "provider" ? role : "user";
}

export function toCategory(category: string): AccountCategory {
  if (category === "university" || category === "government" || category === "provider") return category;
  return "individual";
}

export function toProviderKind(kind: string | null | undefined): ProviderKind {
  return kind === "loan" || kind === "support" ? kind : null;
}

/** Resolve the actor from a validated session user. Pure and unit-tested. */
export function actorFromSession(user: {
  id: string;
  role: string;
  category: string;
  status: string;
  providerKind?: string | null;
}): Actor {
  return {
    userId: user.id,
    authRole: toAuthRole(user.role),
    category: toCategory(user.category),
    providerKind: user.role === "provider" ? toProviderKind(user.providerKind) : null,
    status: user.status,
  };
}

export function isActiveActor(actor: Pick<Actor, "status">): boolean {
  return actor.status !== "deactivated" && actor.status !== "deleted";
}

/** University/education-organization actor (category-derived, member access). */
export function isEducationActor(actor: Pick<Actor, "authRole" | "category">): boolean {
  return actor.authRole === "user" && (actor.category === "university" || actor.category === "government");
}

/**
 * Role gate for a capability. Denies by default: unknown capabilities,
 * inactive accounts, and unlisted actors all return false. Admin bypasses
 * every capability. Provider loan/support capabilities admit providers
 * whose kind is unset or matches. Providers may create project workspaces,
 * but funding requests remain requester-only and provider responses stay
 * scoped to requests assigned to the provider.
 */
const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set([
  "admin.access",
  "admin.users.manage",
  "storage.reconcile.read",
  "provider.queue.read",
  "provider.loan.respond",
  "provider.support.respond",
  "org.manage",
  "group.manage",
  "group.wallet.act",
  "project.create",
  "project.edit",
  "request.create",
  "request.decide",
  "call.transcript.manage",
  "wallet.review",
  "payment.bind",
]);

export function can(actor: Actor, capability: Capability): boolean {
  if (!isActiveActor(actor)) return false;
  if (!KNOWN_CAPABILITIES.has(capability)) return false;
  if (actor.authRole === "admin") return true;
  switch (capability) {
    case "admin.access":
    case "admin.users.manage":
    case "storage.reconcile.read":
    case "wallet.review":
      return false;
    case "provider.queue.read":
      return actor.authRole === "provider";
    case "provider.loan.respond":
      return actor.authRole === "provider" && actor.providerKind !== "support";
    case "provider.support.respond":
      return actor.authRole === "provider" && actor.providerKind !== "loan";
    case "org.manage":
    case "group.manage":
    case "group.wallet.act":
    case "request.create":
      return actor.authRole === "user";
    case "project.create":
      return actor.authRole === "user" || actor.authRole === "provider";
    case "project.edit":
    case "request.decide":
    case "call.transcript.manage":
    case "payment.bind":
      // Membership/ownership/participant checks live in the owning route;
      // any active signed-in role may still access their scoped resources.
      return true;
    default:
      return false;
  }
}

/**
 * Resolve the session and enforce a capability for an API route. Returns the
 * actor on success or a ready 401/403 response on failure.
 */
export async function requireCapability(
  capability: Capability,
): Promise<{ actor: Actor; response: null } | { actor: null; response: Response }> {
  const session = await getSession();
  if (!session) return { actor: null, response: apiError("Sign in required.", 401) };
  const actor = actorFromSession({
    id: session.user.id,
    role: session.user.role,
    category: session.user.category,
    status: session.user.status,
    providerKind: session.user.providerKind,
  });
  if (!isActiveActor(actor)) {
    return { actor: null, response: apiError("This account is no longer active.", 403) };
  }
  if (!can(actor, capability)) {
    return { actor: null, response: apiError("You are not allowed to perform this action.", 403) };
  }
  return { actor, response: null };
}

/**
 * Approved actor/action matrix for review: each capability mapped to the
 * actors admitted by `can()`. Membership/ownership-gated rows admit the
 * role but still require the resource relationship in the owning route.
 */
export interface MatrixRow {
  capability: Capability;
  admin: boolean;
  providerLoan: boolean;
  providerSupport: boolean;
  providerUnset: boolean;
  education: boolean;
  member: boolean;
  note: string;
}

function probe(authRole: AuthRole, category: AccountCategory, providerKind: ProviderKind, capability: Capability): boolean {
  return can({ userId: "probe", authRole, category, providerKind, status: "active" }, capability);
}

export function actorMatrix(): MatrixRow[] {
  const capabilities: Capability[] = [...KNOWN_CAPABILITIES] as Capability[];
  const notes: Record<Capability, string> = {
    "admin.access": "Admin routes, overview, audit",
    "admin.users.manage": "User moderation actions",
    "storage.reconcile.read": "Read-only bucket inventory",
    "provider.queue.read": "Provider request queues",
    "provider.loan.respond": "Loan/funding responses",
    "provider.support.respond": "Support responses",
    "org.manage": "Own organization or admin",
    "group.manage": "Group owner/admin or admin",
    "group.wallet.act": "Per approval rules",
    "project.create": "Active member, institution, or provider; funding requests remain requester-only",
    "project.edit": "Owner/editor or admin",
    "request.create": "Member or institution who owns the project / group",
    "request.decide": "Requester side or admin",
    "call.transcript.manage": "Call participants only",
    "wallet.review": "Independent reviewer (admin)",
    "payment.bind": "Own methods, pending until verified",
  };
  return capabilities.map((capability) => ({
    capability,
    admin: probe("admin", "individual", null, capability),
    providerLoan: probe("provider", "provider", "loan", capability),
    providerSupport: probe("provider", "provider", "support", capability),
    providerUnset: probe("provider", "provider", null, capability),
    education: probe("user", "university", null, capability),
    member: probe("user", "individual", null, capability),
    note: notes[capability],
  }));
}
