import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * JSON-first flexible records (correction §2).
 *
 * User-defined and AI-generated attributes live inside the `doc` JSONB
 * document, so new fields never require a schema migration. Relational
 * columns keep ownership, visibility, revision, and timestamps queryable.
 */
export const flexibleRecords = pgTable(
  "flexible_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** User-defined entity type, e.g. `digital_project`. Never a fixed schema. */
    recordType: text("record_type").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** private | group | public */
    visibility: text("visibility").notNull().default("private"),
    groupId: text("group_id"),
    /** The flexible JSON document — dynamic fields and nested values. */
    doc: jsonb("doc").$type<Record<string, unknown>>().notNull().default({}),
    /** Optimistic-concurrency revision, bumped on every update. */
    revision: integer("revision").notNull().default(1),
    /** active | processing | failed | archived */
    status: text("status").notNull().default("active"),
    /** Provenance: source, model/parser version, confidence, timestamps. */
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("flex_record_owner_type_idx").on(t.ownerId, t.recordType, t.updatedAt),
    index("flex_record_visibility_idx").on(t.visibility, t.recordType, t.updatedAt),
    index("flex_record_group_idx").on(t.groupId, t.updatedAt),
    index("flex_record_doc_gin").using("gin", t.doc),
  ],
);

export type FlexibleRecord = typeof flexibleRecords.$inferSelect;
