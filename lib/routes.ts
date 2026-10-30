/**
 * Centralized route map — every visible navigation item must lead to a real,
 * implemented destination. Import from here instead of hardcoding paths.
 */

export const ROUTES = {
  root: "/",
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  legalPrivacy: "/legal/privacy",
  legalTerms: "/legal/terms",
  legalAgreement: "/legal/agreement",
  landing: "/",
  dashboard: "/dashboard",
  profile: "/dashboard/profile",
  profileById: (shortId: string) => `/dashboard/profile/${shortId}`,
  conneckt: "/dashboard/conneckt",
  chat: "/dashboard/chat",
  chatThread: (id: string) => `/dashboard/chat/${id}`,
  matching: "/dashboard/matching",
  wallet: "/dashboard/wallet",
  plans: "/dashboard/plans",
  actions: "/dashboard/actions",
  notifications: "/dashboard/notifications",
  projects: "/dashboard/projects",
  projectById: (id: string) => `/dashboard/projects/${id}`,
  organizations: "/dashboard/organizations",
  organizationById: (id: string) => `/dashboard/organizations/${id}`,
  requests: "/dashboard/requests",
  requestById: (id: string) => `/dashboard/requests/${id}`,
  groups: "/dashboard/groups",
  groupById: (id: string) => `/dashboard/groups/${id}`,
  settings: "/dashboard/settings",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminGroups: "/admin/groups",
  adminProjects: "/admin/projects",
  adminRequests: "/admin/requests",
  adminAudit: "/admin/audit",
  adminSettings: "/admin/settings",
  api: {
    auth: "/api/auth",
    socket: "/api/socket",
    cronActions: "/api/cron/actions",
    health: "/api/health",
  },
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Font Awesome icon name (solid set) resolved by the Icon component. */
  icon: string;
  /** Badge count key resolved from the dashboard counts endpoint. */
  countKey?: "chat" | "notifications" | "conneckt";
  adminOnly?: boolean;
}

/** Shared navigation configuration used by desktop, tablet, and mobile nav. */
export const DASHBOARD_NAV: NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: "gauge-high" },
  { href: ROUTES.profile, label: "Profile", icon: "user" },
  { href: ROUTES.conneckt, label: "Conneckt", icon: "users", countKey: "conneckt" },
  { href: ROUTES.chat, label: "Chat", icon: "message", countKey: "chat" },
  { href: ROUTES.matching, label: "Matching", icon: "wand-magic-sparkles" },
  { href: ROUTES.wallet, label: "Wallet", icon: "wallet" },
  { href: ROUTES.plans, label: "Plan", icon: "credit-card" },
  { href: ROUTES.actions, label: "Action", icon: "bolt" },
  { href: ROUTES.notifications, label: "Notifications", icon: "bell", countKey: "notifications" },
  { href: ROUTES.projects, label: "Project", icon: "diagram-project" },
  { href: ROUTES.organizations, label: "Organizations", icon: "building" },
  { href: ROUTES.requests, label: "Request", icon: "file-signature" },
  { href: ROUTES.groups, label: "Groups", icon: "user-group" },
  { href: ROUTES.settings, label: "Settings", icon: "gear" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.admin, label: "Overview", icon: "shield-halved" },
  { href: ROUTES.adminUsers, label: "Users", icon: "users-gear" },
  { href: ROUTES.adminGroups, label: "Groups", icon: "user-group" },
  { href: ROUTES.adminProjects, label: "Projects", icon: "diagram-project" },
  { href: ROUTES.adminRequests, label: "Requests", icon: "file-signature" },
  { href: ROUTES.adminAudit, label: "Audit log", icon: "list-check" },
  { href: ROUTES.adminSettings, label: "Settings", icon: "gear" },
];

/** Routes that require an authenticated session. */
export const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/** Public routes reachable without a session. */
export const PUBLIC_ROUTES = new Set([
  ROUTES.root,
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.legalPrivacy,
  ROUTES.legalTerms,
  ROUTES.legalAgreement,
  ROUTES.landing,
]);
