import { ROUTES } from "@/lib/routes";

/**
 * Route-aware application tour (correction §14).
 *
 * Each step waits for its route to render and its element to appear; steps
 * whose UI is unavailable or inaccessible are skipped instead of pointing
 * at nonexistent elements. Covers dashboard, profile, discovery, matching,
 * projects, groups, chat, funding, wallet, notifications, settings, privacy.
 */

export interface TourStep {
  /** Null = whatever page the tour starts on (no navigation). */
  route: string | null;
  selector: string;
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    route: null,
    selector: "#tour-sidebar",
    title: "Navigate anywhere",
    description:
      "Every section lives here — dashboard, profile, discovery, chat, projects, funding, and settings. The badge counts are your real unread totals.",
  },
  {
    route: ROUTES.dashboard,
    selector: "#dash-stats",
    title: "Your overview",
    description: "Unread messages, pending requests, opportunities, and notifications — all computed from your data.",
  },
  {
    route: ROUTES.dashboard,
    selector: "#dash-profile",
    title: "Profile strength",
    description: "Complete your profile to unlock better matching with collaborators.",
  },
  {
    route: ROUTES.dashboard,
    selector: "#dash-actions",
    title: "Upcoming actions",
    description: "Scheduled automations run on the server, even when you are offline.",
  },
  {
    route: ROUTES.profile,
    selector: "#tour-main",
    title: "Your profile",
    description:
      "Your short identifier, skills, and objectives. Contact and financial details stay private according to your visibility settings.",
  },
  {
    route: ROUTES.conneckt,
    selector: "#tour-main",
    title: "Discover and connect",
    description:
      "Search people by short identifier, send connection requests, and — as a group — connect with funding and support providers.",
  },
  {
    route: ROUTES.matching,
    selector: "#tour-main",
    title: "Get matched",
    description:
      "Answer four questions to surface collaborators with complementary skills. Approve or reject each suggestion; rejected ones never return.",
  },
  {
    route: ROUTES.projects,
    selector: "#tour-main",
    title: "Build projects",
    description:
      "Share ideas, collect contributions, add custom fields, and request AI-assisted analysis. Every version is kept.",
  },
  {
    route: ROUTES.groups,
    selector: "#tour-main",
    title: "Work in groups",
    description: "Create groups around shared objectives, manage members, and collaborate with pooled resources.",
  },
  {
    route: ROUTES.chat,
    selector: "#tour-main",
    title: "Chat in real time",
    description:
      "Persistent direct and group conversations with live delivery — plus one-to-one audio and video calls from any direct conversation.",
  },
  {
    route: ROUTES.requests,
    selector: "#tour-main",
    title: "Request funding",
    description:
      "Turn a project into a formal funding request, share a permitted summary with providers, and review agreements.",
  },
  {
    route: ROUTES.wallet,
    selector: "#tour-main",
    title: "Track money honestly",
    description:
      "Record self-funding and group contributions in an auditable ledger. Nothing counts until it is verified and approved.",
  },
  {
    route: ROUTES.plans,
    selector: "#tour-main",
    title: "Plans",
    description:
      "Basic and Super plans per account category. Paid access activates only after your payment is verified.",
  },
  {
    route: ROUTES.actions,
    selector: "#tour-main",
    title: "Automate actions",
    description:
      "Describe an instruction by text or voice, review the proposal, and schedule it with timezone-aware execution.",
  },
  {
    route: ROUTES.notifications,
    selector: "#tour-main",
    title: "Stay notified",
    description:
      "Messages, decisions, funding updates, and reminders — each linked to the real record behind it.",
  },
  {
    route: ROUTES.settings,
    selector: "#tour-main",
    title: "Settings and privacy",
    description:
      "Update your profile, manage sessions, control notification preferences, and request deactivation or deletion.",
  },
];
