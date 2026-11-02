import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups } from "./social";
import { supportRequests } from "./projects";

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
    /** Structured negotiation thread for one funding request (Project.md §8). */
    requestId: text("request_id"),
    supportRequestId: text("support_request_id").references(() => supportRequests.id, { onDelete: "cascade" }),
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
    uniqueIndex("conversation_request_unique").on(t.requestId),
    uniqueIndex("conversation_support_request_unique").on(t.supportRequestId),
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
    /** Per-member conversation prefs: { muted, pinned, archived }. */
    settings: jsonb("settings")
      .$type<{ muted?: boolean; pinned?: boolean; archived?: boolean }>()
      .notNull()
      .default({}),
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
    /** Null for system messages (member joined, call ended, ...). */
    senderId: text("sender_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    /** user | system */
    kind: text("kind").notNull().default("user"),
    body: text("body").notNull(),
    /** Client-generated id for safe retries without duplicates. */
    clientMessageId: text("client_message_id"),
    attachmentId: text("attachment_id"),
    /** Reply reference — the quoted message, preserved after refresh. */
    replyToId: text("reply_to_id").references((): AnyPgColumn => messages.id, {
      onDelete: "set null",
    }),
    /**
     * Optional structured content (JSON-first): shared references
     * ({ reference: { type, id, title } }), forward origin
     * ({ forwardedFrom: { conversationId, messageId } }), voice-note flags.
     */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    /** Delete-for-everyone tombstone; body is then a placeholder. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("message_client_unique").on(t.conversationId, t.clientMessageId),
    index("message_reply_idx").on(t.replyToId),
  ],
);

/** Persistent emoji reactions — one identical reaction per user per message. */
export const messageReactions = pgTable(
  "message_reactions",
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
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reaction_message_user_emoji_unique").on(t.messageId, t.userId, t.emoji),
    index("reaction_message_idx").on(t.messageId),
  ],
);

/** Delete-for-me: per-user hides that never affect other members. */
export const messageHides = pgTable(
  "message_hides",
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("hide_message_user_unique").on(t.messageId, t.userId)],
);

/**
 * AI task runs in chat (spec §9 provenance): task config, actual input,
 * service metadata, processing state, structured result, timestamps.
 */
export const aiTaskRuns = pgTable(
  "ai_task_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    taskId: text("task_id").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull().default({}),
    /** pending | processing | succeeded | failed */
    status: text("status").notNull().default("pending"),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    model: text("model"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_run_user_idx").on(t.userId, t.createdAt),
    index("ai_run_conversation_idx").on(t.conversationId, t.createdAt),
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
    /** ringing | accepted | declined | ended | missed | failed */
    status: text("status").notNull().default("ringing"),
    /** Honest failure reason (network failed, unreachable, ...). */
    failureReason: text("failure_reason"),
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

/** Participants and per-user lifecycle for a one-to-one or group call. */
export const callParticipants = pgTable(
  "call_participants",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("participant"),
    status: text("status").notNull().default("invited"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("call_participant_call_user_unique").on(t.callId, t.userId),
    index("call_participant_user_status_idx").on(t.userId, t.status, t.invitedAt),
    index("call_participant_call_status_idx").on(t.callId, t.status),
  ],
);

/**
 * Per-call transcription consent (role-aware §B). Transcription is active
 * only while EVERY participant holds a consented=true row; either party
 * flipping to false stops further persistence immediately. Rows record
 * participant + timestamp + call; every change is also audited.
 * No raw call audio/video is ever stored — segments hold text only.
 */
export const callTranscriptConsents = pgTable(
  "call_transcript_consents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consented: boolean("consented").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("call_consent_call_user_unique").on(t.callId, t.userId),
    index("call_consent_call_idx").on(t.callId),
  ],
);

/**
 * Transcript segments for one call. segmentIndex is the idempotency key:
 * reconnects and duplicate deliveries overwrite the same index instead of
 * corrupting history. Speaker attribution is stored only when supplied by
 * a reliable diarization path and is always labeled as attributed.
 */
export const callTranscripts = pgTable(
  "call_transcripts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    segmentIndex: integer("segment_index").notNull(),
    speaker: text("speaker"),
    text: text("text").notNull(),
    final: boolean("final").notNull().default(true),
    turnId: integer("turn_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("call_transcript_segment_unique").on(t.callId, t.segmentIndex),
    index("call_transcript_call_idx").on(t.callId),
  ],
);

/** Per-user hide state for ended/accepted calls (the history toggle). */
export const callHides = pgTable(
  "call_hides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("call_hide_call_user_unique").on(t.callId, t.userId)],
);
