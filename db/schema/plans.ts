import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups } from "./social";

/** Configurable product catalog — prices are proposed, not confirmed revenue. */
export const plans = pgTable("plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** individual | group | provider */
  category: text("category").notNull(),
  /** basic | super */
  tier: text("tier").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    /** pending | active | cancelled | expired */
    status: text("status").notNull().default("pending"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("subscription_user_idx").on(t.userId, t.status),
    index("subscription_group_idx").on(t.groupId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    provider: text("provider").notNull().default("manual"),
    providerRef: text("provider_ref"),
    /** pending | verified | failed | refunded */
    status: text("status").notNull().default("pending"),
    verifiedBy: text("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payment_subscription_idx").on(t.subscriptionId)],
);
