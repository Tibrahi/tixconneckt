import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups } from "./social";

/** Amounts are stored in minor units (cents) to avoid float errors. */

export const wallets = pgTable(
  "wallets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** user | group */
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    currency: text("currency").notNull().default("USD"),
    balanceMinor: integer("balance_minor").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("wallet_owner_unique").on(t.ownerType, t.ownerId, t.currency)],
);

/** Auditable ledger. Balances derive from approved entries only. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    /** credit | debit */
    direction: text("direction").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    /** Unique human-readable reference, e.g. TX-2026-000123 */
    reference: text("reference").notNull(),
    /** pending | approved | rejected | reversed */
    status: text("status").notNull().default("pending"),
    /** self_funding | contribution | provider_funding | withdrawal | transfer | fee */
    kind: text("kind").notNull(),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    documentId: text("document_id"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ledger_reference_unique").on(t.reference),
    index("ledger_wallet_idx").on(t.walletId, t.status),
    index("ledger_related_idx").on(t.relatedType, t.relatedId),
  ],
);

/** Full history of every ledger state transition. */
export const ledgerTransitions = pgTable(
  "ledger_transitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    entryId: text("entry_id")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ledger_transition_entry_idx").on(t.entryId)],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    walletId: text("wallet_id").references(() => wallets.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    /** targeted | general */
    kind: text("kind").notNull().default("general"),
    targetMinor: integer("target_minor"),
    minMinor: integer("min_minor"),
    maxMinor: integer("max_minor"),
    currency: text("currency").notNull().default("USD"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("savings_group_idx").on(t.groupId)],
);

export const contributions = pgTable(
  "contributions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    goalId: text("goal_id").references(() => savingsGoals.id, {
      onDelete: "set null",
    }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    ledgerEntryId: text("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("contribution_wallet_idx").on(t.walletId)],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    ledgerEntryId: text("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    /** pending | approved | rejected | executed */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("withdrawal_wallet_idx").on(t.walletId, t.status)],
);
