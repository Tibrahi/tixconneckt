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

/** Server-side scheduled actions — never depend on the browser being open. */
export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id"),
    /** message | profile_update | reminder | workflow */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Always UTC; timezone kept alongside for display and DST handling. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    /** draft | confirmed | executing | completed | failed | cancelled */
    status: text("status").notNull().default("draft"),
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    preNotifiedAt: timestamp("pre_notified_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("action_idempotency_unique").on(t.idempotencyKey),
    index("action_due_idx").on(t.status, t.scheduledFor),
    index("action_user_idx").on(t.userId),
    index("action_user_status_time_idx").on(t.userId, t.status, t.scheduledFor),
  ],
);

export const actionAttempts = pgTable(
  "action_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actionId: text("action_id")
      .notNull()
      .references(() => scheduledActions.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** success | failure */
    outcome: text("outcome"),
    detail: text("detail"),
  },
  (t) => [index("action_attempt_action_idx").on(t.actionId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** chat | connection | group | matching | wallet | project | action | security | subscription | request */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.readAt, t.createdAt),
    index("notification_resource_idx").on(t.resourceType, t.resourceId),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    /** socket | email */
    channel: text("channel").notNull(),
    /** pending | sent | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("delivery_notification_idx").on(t.notificationId)],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** user | group */
    ownerType: text("owner_type").notNull().default("user"),
    /** wallet | project | request | profile | chat */
    module: text("module").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("document_owner_idx").on(t.ownerId, t.module)],
);

export const parsingJobs = pgTable(
  "parsing_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputText: text("input_text"),
    /** pending | processing | needs_review | approved | failed */
    status: text("status").notNull().default("pending"),
    proposedJson: jsonb("proposed_json").$type<Record<string, unknown>>(),
    error: text("error"),
    destinationType: text("destination_type"),
    destinationId: text("destination_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("parsing_job_requester_idx").on(t.requestedBy)],
);

export const matchingProfiles = pgTable("matching_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  objective: text("objective"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  field: text("field"),
  education: text("education"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const matchResults = pgTable(
  "match_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score"),
    rationale: text("rationale"),
    /** suggested | approved | rejected | dismissed */
    status: text("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("match_pair_unique").on(t.userId, t.candidateId),
    index("match_user_idx").on(t.userId, t.status),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actorId),
    index("audit_target_idx").on(t.targetType, t.targetId),
    index("audit_created_idx").on(t.createdAt),
  ],
);
