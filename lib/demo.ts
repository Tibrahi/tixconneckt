import { ROUTES } from "./routes";

export type DemoPersonaKey =
  | "individual"
  | "university"
  | "government"
  | "provider-loan"
  | "provider-support";

export interface DemoPersona {
  key: DemoPersonaKey;
  /** Button label on the demo list. */
  label: string;
  /** One line on what this role sees. */
  description: string;
  name: string;
  email: string;
  role: string;
  category: string;
  providerKind: string | null;
  redirectTo: string;
}

/** Demo addresses are fake and cannot receive real mail. */
const DEMO_DOMAIN = "@tixconneckt.demo";

/**
 * One-click, non-administrator personas for public evaluation.
 */
export const DEMO_PERSONAS: DemoPersona[] = [
  {
    key: "individual",
    label: "Individual",
    description: "Personal workspace: profile, matching, projects, wallet.",
    name: "Demo Individual",
    email: `demo-individual${DEMO_DOMAIN}`,
    role: "user",
    category: "individual",
    providerKind: null,
    redirectTo: ROUTES.dashboard,
  },
  {
    key: "university",
    label: "University",
    description: "Institution profile, campus projects, research groups.",
    name: "Demo University",
    email: `demo-university${DEMO_DOMAIN}`,
    role: "user",
    category: "university",
    providerKind: null,
    redirectTo: ROUTES.dashboard,
  },
  {
    key: "government",
    label: "Government",
    description: "Agency profile, public programs, coordination groups.",
    name: "Demo Government",
    email: `demo-government${DEMO_DOMAIN}`,
    role: "user",
    category: "government",
    providerKind: null,
    redirectTo: ROUTES.dashboard,
  },
  {
    key: "provider-loan",
    label: "Loan Provider",
    description: "Funding queue: requests assigned to this lender.",
    name: "Demo Funding Provider",
    email: `demo-provider-loan${DEMO_DOMAIN}`,
    role: "provider",
    category: "provider",
    providerKind: "loan",
    redirectTo: ROUTES.dashboard,
  },
  {
    key: "provider-support",
    label: "Support Provider",
    description: "Support queue: cases assigned to this provider.",
    name: "Demo Support Provider",
    email: `demo-provider-support${DEMO_DOMAIN}`,
    role: "provider",
    category: "provider",
    providerKind: "support",
    redirectTo: ROUTES.dashboard,
  },
];

export function getDemoPersona(key: string): DemoPersona | undefined {
  return DEMO_PERSONAS.find((persona) => persona.key === key);
}

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(DEMO_DOMAIN);
}

/**
 * Operator kill switch. Open by default for evaluation; set DEMO_MODE=false
 * to hide the entry button, disable the page, and refuse demo sign-ins.
 */
export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE !== "false";
}

function roleLabel(role: string, category: string, providerKind: string | null): string {
  if (role === "provider") return providerKind === "support" ? "Support Provider" : "Loan Provider";
  if (category === "university") return "University";
  if (category === "government") return "Government";
  return "Individual";
}

/** Banner label for demo sessions; null for real accounts. */
export function demoLabelForUser(user: {
  email: string;
  name: string;
  role: string;
  category: string;
  providerKind: string | null;
}): string | null {
  if (!isDemoEmail(user.email)) return null;
  return `${user.name} · ${roleLabel(user.role, user.category, user.providerKind)}`;
}
