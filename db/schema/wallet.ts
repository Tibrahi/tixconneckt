import {
  boolean,
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

/** Auditable ledger. Balances derive from approved/credited entries only. */
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
    /** pending | needs_evidence | approved | credited | rejected | cancelled | reversed */
    status: text("status").notNull().default("pending"),
    /** self_funding | contribution | provider_funding | withdrawal | transfer | fee */
    kind: text("kind").notNull(),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    /** Provider/payment transaction reference for duplicate detection. Globally unique when present. */
    providerRef: text("provider_ref"),
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
    index("ledger_provider_ref_idx").on(t.providerRef),
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
    /** pending | approved | rejected | executed | failed */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Client-supplied idempotency key: duplicate submits return the same request. */
    idempotencyKey: text("idempotency_key"),
    /** Payout provider, e.g. tixlpay. */
    provider: text("provider").notNull().default("tixlpay"),
    /** Provider-side payout reference once submitted. */
    providerReference: text("provider_reference"),
    /** awaiting_review | submitted | completed | failed — provider leg of the payout. */
    providerStatus: text("provider_status").notNull().default("awaiting_review"),
    failureReason: text("failure_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("withdrawal_wallet_idx").on(t.walletId, t.status),
    uniqueIndex("withdrawal_idempotency_unique").on(t.idempotencyKey),
    index("withdrawal_provider_ref_idx").on(t.providerReference),
  ],
);

/**
 * Per-member savings account configuration (wallet.md FR-06).
 *
 * Minimum contribution, maximum contribution, and minimum withdrawal are
 * independent rules — none of them is the savings target.
 */
export const memberAccounts = pgTable("member_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("RWF"),
  /** Savings target the member wants to reach (minor units, optional). */
  savingsTargetMinor: integer("savings_target_minor"),
  /** Lowest permitted contribution per transaction. */
  minContributionMinor: integer("min_contribution_minor"),
  /** Optional upper limit per contribution transaction. */
  maxContributionMinor: integer("max_contribution_minor"),
  /** Lowest permitted withdrawal amount. */
  minWithdrawalMinor: integer("min_withdrawal_minor"),
  startDate: timestamp("start_date", { withTimezone: true }),
  targetDate: timestamp("target_date", { withTimezone: true }),
  /** weekly | biweekly | monthly | quarterly | once */
  frequency: text("frequency").notNull().default("monthly"),
  /** { cooldownDays, requiresApproval } — withdrawal policy for this account. */
  withdrawalRules: jsonb("withdrawal_rules")
    .$type<{ cooldownDays?: number; requiresApproval?: boolean }>()
    .notNull()
    .default({}),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifyInApp: boolean("notify_in_app").notNull().default(true),
  /** private | group_totals — whether this member's data feeds group totals. */
  visibility: text("visibility").notNull().default("private"),
  /** active | restricted | locked | closed — locked/closed is admin-only. */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MemberAccount = typeof memberAccounts.$inferSelect;
