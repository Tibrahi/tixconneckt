/**
 * Seed explicitly-defined reference data only: legal document versions and
 * the configurable plan catalog. Never fabricates users, activity, or balances.
 *
 * Usage: npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env" });

import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { legalDocuments, plans } from "./schema";
import { LEGAL_DOCUMENTS } from "../lib/legal-content";

const PLAN_CATALOG = [
  {
    category: "individual",
    tier: "basic",
    priceMinor: 500,
    benefits: [
      "Professional profile and matching",
      "Individual connections and chat",
      "Self-funding wallet",
      "Public project participation",
    ],
  },
  {
    category: "individual",
    tier: "super",
    priceMinor: 1000,
    benefits: [
      "Everything in Individual Basic",
      "Private project visibility",
      "Priority matching suggestions",
      "Advanced wallet insights",
    ],
  },
  {
    category: "group",
    tier: "basic",
    priceMinor: 1000,
    benefits: [
      "Group workspace and chat",
      "Shared group wallet",
      "Group savings goals",
      "Public project collaboration",
    ],
  },
  {
    category: "group",
    tier: "super",
    priceMinor: 1500,
    benefits: [
      "Everything in Group Basic",
      "Private project visibility",
      "Provider connection workflows",
      "Group approval audit trail",
    ],
  },
  {
    category: "provider",
    tier: "basic",
    priceMinor: 1000,
    benefits: [
      "Provider profile and discovery",
      "Connection request management",
      "Funding workflow access",
    ],
  },
  {
    category: "provider",
    tier: "super",
    priceMinor: 2000,
    benefits: [
      "Everything in Provider Basic",
      "Private project summaries access",
      "Agreement management",
      "Portfolio funding history",
    ],
  },
] as const;

async function main() {
  const db = getDb();

  for (const doc of LEGAL_DOCUMENTS) {
    const existing = await db
      .select({ id: legalDocuments.id })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, doc.type), eq(legalDocuments.version, doc.version)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(legalDocuments).values({
        type: doc.type,
        version: doc.version,
        title: doc.title,
        body: doc.body,
      });
      console.log(`seeded legal document: ${doc.type} v${doc.version}`);
    }
  }

  for (const plan of PLAN_CATALOG) {
    const existing = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.category, plan.category), eq(plans.tier, plan.tier)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(plans).values({
        category: plan.category,
        tier: plan.tier,
        priceMinor: plan.priceMinor,
        currency: "USD",
        benefits: [...plan.benefits],
      });
      console.log(`seeded plan: ${plan.category}/${plan.tier}`);
    }
  }

  console.log("seed complete");
}

main().catch((error) => {
  console.error("seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
