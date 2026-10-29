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

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    /** public | private */
    visibility: text("visibility").notNull().default("public"),
    /** idea | developing | funded | completed | archived */
    stage: text("stage").notNull().default("idea"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("project_owner_idx").on(t.ownerId),
    index("project_owner_updated_idx").on(t.ownerId, t.updatedAt),
    index("project_group_updated_idx").on(t.groupId, t.updatedAt),
    index("project_visibility_idx").on(t.visibility, t.stage),
  ],
);

export const projectContributions = pgTable(
  "project_contributions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_contribution_project_idx").on(t.projectId)],
);

export const projectReplies = pgTable(
  "project_replies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => projectContributions.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_reply_contribution_idx").on(t.contributionId)],
);

export const projectReactions = pgTable(
  "project_reactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("like"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("project_reaction_unique").on(t.projectId, t.userId)],
);

/** Versioned AI analysis — never overwrite previous results. */
export const projectAnalyses = pgTable(
  "project_analyses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    /** researched | assumption | mixed */
    evidence: text("evidence").notNull().default("assumption"),
    /** pending | completed | failed */
    status: text("status").notNull().default("pending"),
    requestedBy: text("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_analysis_version_unique").on(t.projectId, t.version),
    index("project_analysis_project_idx").on(t.projectId),
  ],
);

export const fundingRequests = pgTable(
  "funding_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** individual | group */
    requesterType: text("requester_type").notNull(),
    requesterId: text("requester_id").notNull(),
    providerId: text("provider_id").references(() => users.id, {
      onDelete: "set null",
    }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    message: text("message"),
    /** draft | pending | under_review | approved | rejected | funded | closed */
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("funding_request_project_idx").on(t.projectId),
    index("funding_request_project_status_idx").on(t.projectId, t.status),
    index("funding_request_provider_idx").on(t.providerId, t.status),
    index("funding_request_requester_idx").on(t.requesterType, t.requesterId),
  ],
);

export const agreements = pgTable(
  "agreements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requestId: text("request_id")
      .notNull()
      .references(() => fundingRequests.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    terms: text("terms"),
    documentId: text("document_id"),
    /** draft | pending | accepted | rejected */
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agreement_request_version_unique").on(t.requestId, t.version),
    index("agreement_request_idx").on(t.requestId),
  ],
);
