import { ROUTES } from "./routes";

/** Public product copy grounded in the workflows implemented in this app. */
export const HOMEPAGE_SECTION_IDS = [
  "platform",
  "people",
  "workflows",
  "mission",
  "privacy",
  // Retained as a stable legacy anchor identifier for saved links.
  "availability",
] as const;

export type HomepageSectionId = (typeof HOMEPAGE_SECTION_IDS)[number];

export interface HomepageSection {
  id: HomepageSectionId;
  navLabel: string;
  heading: string;
}

export const HOMEPAGE_SECTIONS: HomepageSection[] = [
  { id: "platform", navLabel: "The platform", heading: "A connected way to move work forward" },
  { id: "people", navLabel: "Who it serves", heading: "Built for the people around the work" },
  { id: "workflows", navLabel: "How work moves", heading: "From a first connection to shared progress" },
  { id: "mission", navLabel: "Our purpose", heading: "Make collaboration easier to start and sustain" },
  { id: "privacy", navLabel: "Your account", heading: "Work together with clear boundaries" },
  { id: "availability", navLabel: "Availability", heading: "Availability" },
];

export interface HomepageCapability {
  icon: string;
  title: string;
  text: string;
}

export const HOMEPAGE_CAPABILITIES: HomepageCapability[] = [
  {
    icon: "user",
    title: "Make skills visible",
    text: "Create a profile around your objectives, experience, skills, and areas of interest, with controls for what others can see.",
  },
  {
    icon: "users",
    title: "Find the right collaborators",
    text: "Explore people and organizations, use matching suggestions, and manage connection requests in one place.",
  },
  {
    icon: "diagram-project",
    title: "Give ideas a working space",
    text: "Create or join digital projects, organize shared documents, contribute feedback, and follow revisions over time.",
  },
  {
    icon: "user-group",
    title: "Coordinate as a team",
    text: "Bring people into groups, share conversations, and use roles and approvals to guide shared work.",
  },
  {
    icon: "file-signature",
    title: "Request practical support",
    text: "Connect project needs with funding or support providers, share selected project material, and keep decisions together.",
  },
  {
    icon: "wallet",
    title: "Keep contributions understandable",
    text: "Review personal and group funding records, contribution activity, approvals, and related project context.",
  },
  {
    icon: "message",
    title: "Keep the conversation close",
    text: "Continue through persistent chat, notifications, and one-to-one audio or video calls linked to your connections.",
  },
  {
    icon: "bolt",
    title: "Keep important follow-ups moving",
    text: "Schedule reminders, messages, and profile updates, then review their progress and outcomes.",
  },
];

export interface HomepageStep {
  title: string;
  text: string;
}

export const HOMEPAGE_STEPS: HomepageStep[] = [
  { title: "Set out who you are", text: "Create an account and describe your skills, interests, and objectives." },
  { title: "Find people around the work", text: "Discover collaborators, organizations, groups, and relevant projects." },
  { title: "Build in a shared space", text: "Coordinate through project documents, contributions, groups, and conversations." },
  { title: "Bring in support and follow through", text: "Make a request, keep decisions visible to the right people, and track related contributions." },
];

/** Retained for compatibility with existing content-contract consumers. */
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
  available: ["Profiles, discovery, projects, groups, conversations, requests, and contribution records"],
  inDevelopmentHeading: "In development",
  inDevelopment: ["Some services depend on account permissions and the workflow selected by the user"],
};

export interface HomepageLink {
  label: string;
  href: string;
}

export const HOMEPAGE_NAV_LINKS: HomepageLink[] = [
  { label: "The platform", href: "#platform" },
  { label: "Who it serves", href: "#people" },
  { label: "How work moves", href: "#workflows" },
  { label: "Our purpose", href: "#mission" },
];

export const HOMEPAGE_FOOTER_GROUPS: Array<{ heading: string; links: HomepageLink[] }> = [
  {
    heading: "Explore",
    links: [
      { label: "The platform", href: "#platform" },
      { label: "Who it serves", href: "#people" },
      { label: "How work moves", href: "#workflows" },
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
    heading: "Policies",
    links: [
      { label: "Privacy policy", href: ROUTES.legalPrivacy },
      { label: "Terms of service", href: ROUTES.legalTerms },
      { label: "User agreement", href: ROUTES.legalAgreement },
    ],
  },
];

export function homepageLinks(): HomepageLink[] {
  return [
    ...HOMEPAGE_NAV_LINKS,
    { label: "Create account", href: ROUTES.register },
    { label: "Sign in", href: ROUTES.login },
    { label: "Explore the platform", href: "#platform" },
    { label: "Who it serves", href: "#people" },
    { label: "How work moves", href: "#workflows" },
    { label: "Privacy policy", href: ROUTES.legalPrivacy },
    { label: "Terms of service", href: ROUTES.legalTerms },
    { label: "User agreement", href: ROUTES.legalAgreement },
    ...HOMEPAGE_FOOTER_GROUPS.flatMap((group) => group.links),
  ];
}
