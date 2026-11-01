import { ROUTES } from "./routes";

/**
 * Trusted homepage content source of truth (system-wide-ui §5).
 *
 * Public claims come only from these reviewed constants — never from user
 * data, AI output, environment variables, or third-party scraping. Copy must
 * stay aligned with verified shipped behavior; capabilities that depend on
 * configuration or unfinished integrations are labeled in-development, never
 * presented as generally available. Edits require code review. Internal
 * vendors, prompts, API details, and infrastructure must never appear here.
 */

export const HOMEPAGE_SECTION_IDS = [
  "platform",
  "how-it-works",
  "mission",
  "availability",
  "privacy",
] as const;

export type HomepageSectionId = (typeof HOMEPAGE_SECTION_IDS)[number];

export interface HomepageSection {
  id: HomepageSectionId;
  /** Short label used in header/footer navigation. */
  navLabel: string;
  /** Visible section heading. */
  heading: string;
}

export const HOMEPAGE_SECTIONS: HomepageSection[] = [
  { id: "platform", navLabel: "Platform", heading: "What you can do" },
  { id: "how-it-works", navLabel: "How it works", heading: "How it works" },
  { id: "mission", navLabel: "Our goal", heading: "Make good digital work easier to start and sustain." },
  { id: "availability", navLabel: "Availability", heading: "Availability" },
  { id: "privacy", navLabel: "Your data", heading: "Your data, your control" },
];

export interface HomepageCapability {
  icon: string;
  title: string;
  text: string;
}

/** Verified capabilities, grouped by the visitor's job. */
export const HOMEPAGE_CAPABILITIES: HomepageCapability[] = [
  {
    icon: "users",
    title: "Find collaborators",
    text: "Discover people by skills and objectives, send connection requests, and build your network.",
  },
  {
    icon: "diagram-project",
    title: "Share and join digital projects",
    text: "Publish software, web, mobile, AI, or data ideas — or contribute to projects others started.",
  },
  {
    icon: "message",
    title: "Coordinate in groups and chat",
    text: "Create groups, manage memberships, and keep persistent conversations with members.",
  },
  {
    icon: "phone",
    title: "Call one-to-one",
    text: "Start audio or video calls with your direct connections, right from the conversation.",
  },
  {
    icon: "funding",
    title: "Request funding or support",
    text: "Submit funding requests with project context, review agreements, and track decisions.",
  },
  {
    icon: "wallet",
    title: "Track funding transparently",
    text: "Record self-funding and group contributions in an auditable ledger with approvals.",
  },
  {
    icon: "bolt",
    title: "Automate routine actions",
    text: "Schedule reminders, messages, and profile updates that run on the server.",
  },
];

export interface HomepageStep {
  title: string;
  text: string;
}

/** The actual account → profile → discovery → collaboration sequence. */
export const HOMEPAGE_STEPS: HomepageStep[] = [
  {
    title: "Create your account",
    text: "Register with your email, verify it with a code, and accept the Privacy Policy, Terms, and Agreement.",
  },
  {
    title: "Complete your profile",
    text: "Add your skills, objectives, and field. You get a unique short identifier others use to find you.",
  },
  {
    title: "Get matched",
    text: "Answer the matching questions to surface collaborators with complementary capabilities.",
  },
  {
    title: "Collaborate and fund",
    text: "Connect, chat, call, join groups, develop projects together, and request funding or support.",
  },
];

/** Approved availability labels — the only two states public copy may use. */
export const HOMEPAGE_AVAILABILITY_LABELS = ["Available now", "In development"] as const;

export interface HomepageAvailability {
  sectionId: HomepageSectionId;
  availableHeading: (typeof HOMEPAGE_AVAILABILITY_LABELS)[number];
  available: string[];
  inDevelopmentHeading: (typeof HOMEPAGE_AVAILABILITY_LABELS)[number];
  inDevelopment: string[];
}

export const HOMEPAGE_AVAILABILITY: HomepageAvailability = {
  sectionId: "availability",
  availableHeading: "Available now",
  available: [
    "Registration, email verification, login with OTP, and password recovery",
    "Profiles with short identifiers, skills, and visibility controls",
    "Matching, connection requests, groups, and persistent chat",
    "One-to-one audio and video calls from direct conversations",
    "Projects with contributions, reactions, and versioned analysis",
    "Funding requests, agreements, wallet ledger, and subscriptions",
    "Scheduled actions, notifications, and email delivery",
  ],
  inDevelopmentHeading: "In development",
  inDevelopment: [
    "Muse Spark and Muse Voice integrations run only after the service credentials are configured; until then the app says so instead of simulating results",
    "Group video conferences are not available yet — calls work one-to-one",
    "Payment providers (cards, mobile money, crypto) are not integrated yet, so subscriptions stay pending until an administrator verifies payment",
  ],
};

export interface HomepageLink {
  label: string;
  href: string;
}

/** Header navigation: section anchors only. */
export const HOMEPAGE_NAV_LINKS: HomepageLink[] = [
  { label: "Platform", href: "#platform" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Our goal", href: "#mission" },
];

/** Footer navigation groups with explicit, testable links. */
export const HOMEPAGE_FOOTER_GROUPS: Array<{ heading: string; links: HomepageLink[] }> = [
  {
    heading: "Platform",
    links: [
      { label: "What you can do", href: "#platform" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Our goal", href: "#mission" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { label: "Create account", href: ROUTES.register },
      { label: "Sign in", href: ROUTES.login },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", href: ROUTES.legalPrivacy },
      { label: "Terms of service", href: ROUTES.legalTerms },
      { label: "User agreement", href: ROUTES.legalAgreement },
    ],
  },
];

/** Every internal link the homepage renders, for route/anchor resolution tests. */
export function homepageLinks(): HomepageLink[] {
  const links: HomepageLink[] = [
    ...HOMEPAGE_NAV_LINKS,
    { label: "Sign in", href: ROUTES.login },
    { label: "Create account", href: ROUTES.register },
    { label: "Explore the platform", href: "#platform" },
    { label: "Privacy Policy", href: ROUTES.legalPrivacy },
    { label: "Terms of Service", href: ROUTES.legalTerms },
    { label: "User Agreement", href: ROUTES.legalAgreement },
  ];
  for (const group of HOMEPAGE_FOOTER_GROUPS) links.push(...group.links);
  return links;
}
