import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups } from "./social";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** direct | group | provider */
    type: text("type").notNull(),
    title: text("title"),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    providerLinkId: text("provider_link_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversation_group_idx").on(t.groupId),
    index("conversation_updated_idx").on(t.updatedAt),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** admin | member */
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("conversation_member_unique").on(t.conversationId, t.userId),
    index("conversation_member_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Client-generated id for safe retries without duplicates. */
    clientMessageId: text("client_message_id"),
    attachmentId: text("attachment_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("message_client_unique").on(t.conversationId, t.clientMessageId),
  ],
);

export const messageReads = pgTable(
  "message_reads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_read_unique").on(t.messageId, t.userId),
    index("message_read_user_idx").on(t.userId, t.messageId),
  ],
);

/** 1:1 call records — lifecycle persisted, media peer-to-peer via WebRTC. */
export const calls = pgTable(
  "calls",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    callerId: text("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calleeId: text("callee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** audio | video */
    kind: text("kind").notNull(),
    /** ringing | accepted | declined | ended | missed */
    status: text("status").notNull().default("ringing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("call_conversation_idx").on(t.conversationId, t.createdAt),
    index("call_participant_idx").on(t.calleeId, t.status, t.createdAt),
    index("call_caller_idx").on(t.callerId, t.status, t.createdAt),
  ],
);

export type Call = typeof calls.$inferSelect;
