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
    /** Dynamic project-specific attributes (JSON-first, correction §2). */
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
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

/**
 * Dynamic project workspace folders (Project.md §4/§7). Every project gets
 * a root folder automatically; owners/members organize freely below it.
 */
export const projectFolders = pgTable(
  "project_folders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentFolderId: text("parent_folder_id"),
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("project_folder_project_idx").on(t.projectId, t.parentFolderId),
    index("project_folder_meta_gin").using("gin", t.metadata),
  ],
);

/**
 * Dynamic project documents (Project.md §4/§7). Structured editor JSON in
 * contentJson; textCache is a server-derived plain-text excerpt for search
 * and previews; binaries live in object storage via documents.
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => projectFolders.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Free-form document type named by the author (proposal, budget, ...). */
    documentType: text("document_type").notNull().default("document"),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull().default({}),
    textCache: text("text_cache").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    attachmentId: text("attachment_id"),
    versionNumber: integer("version_number").notNull().default(1),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("project_file_project_idx").on(t.projectId, t.folderId),
    index("project_file_updated_idx").on(t.projectId, t.updatedAt),
    index("project_file_meta_gin").using("gin", t.metadata),
  ],
);

/** Immutable version snapshots — history is preserved, never overwritten. */
export const projectFileVersions = pgTable(
  "project_file_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fileId: text("file_id")
      .notNull()
      .references(() => projectFiles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_file_version_unique").on(t.fileId, t.versionNumber),
    index("project_file_version_file_idx").on(t.fileId, t.versionNumber),
  ],
);

/** Explicit project collaborators (owner | editor | viewer). */
export const projectMembers = pgTable(
  "project_members",
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
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_member_unique").on(t.projectId, t.userId),
    index("project_member_user_idx").on(t.userId),
  ],
);

/** Append-only project activity (edits, shares, permissions, AI, responses). */
export const projectActivity = pgTable(
  "project_activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_activity_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * Explicit provider shares (Project.md §9): file/folder grants scoped to a
 * request with an optional expiry. Providers see only what is shared.
 */
export const projectShares = pgTable(
  "project_shares",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: text("request_id").references(() => fundingRequests.id, {
      onDelete: "cascade",
    }),
    providerId: text("provider_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull().default("view"),
    fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
    folderIds: jsonb("folder_ids").$type<string[]>().notNull().default([]),
    grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_share_project_idx").on(t.projectId, t.providerId),
    index("project_share_request_idx").on(t.requestId),
  ],
);

/** Company / organization profiles with logos (Project.md §12). */
export const organizations = pgTable(
  "organizations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    website: text("website"),
    country: text("country"),
    contactJson: jsonb("contact_json").$type<Record<string, unknown>>().notNull().default({}),
    logoDocumentId: text("logo_document_id"),
    /** public | private */
    visibility: text("visibility").notNull().default("public"),
    /** unverified | pending | verified */
    verificationStatus: text("verification_status").notNull().default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("organization_owner_idx").on(t.ownerId),
    index("organization_visibility_idx").on(t.visibility),
  ],
);

/** Verification evidence + review history (admins grant verified status). */
export const organizationVerifications = pgTable(
  "organization_verifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    evidenceDocumentIds: jsonb("evidence_document_ids").$type<string[]>().notNull().default([]),
    note: text("note"),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("organization_verification_org_idx").on(t.organizationId, t.createdAt)],
);
