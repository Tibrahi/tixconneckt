-- TIXCONNECKT migration 0004: rich chat (Specification/chat.md).
--
-- All statements are idempotent and non-destructive: no existing data is
-- altered or dropped.

-- Per-member conversation preferences (mute / pin / archive).
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "settings" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Rich message fields: system messages, replies, metadata, tombstones.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'user';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to_id" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_by" text;
-- System messages carry no sender; existing rows are unaffected.
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_reply_to_fk') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_fk"
      FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_deleted_by_fk') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_fk"
      FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "message_reply_idx" ON "messages" ("reply_to_id");

-- Persistent emoji reactions.
CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" text PRIMARY KEY,
  "message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "reaction_message_user_emoji_unique"
  ON "message_reactions" ("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "reaction_message_idx" ON "message_reactions" ("message_id");

-- Delete-for-me hides.
CREATE TABLE IF NOT EXISTS "message_hides" (
  "id" text PRIMARY KEY,
  "message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "hide_message_user_unique"
  ON "message_hides" ("message_id", "user_id");

-- AI task runs with full provenance (chat.md §9).
CREATE TABLE IF NOT EXISTS "ai_task_runs" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" text REFERENCES "conversations"("id") ON DELETE CASCADE,
  "task_id" text NOT NULL,
  "input_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "result_json" jsonb,
  "model" text,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ai_run_user_idx" ON "ai_task_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_run_conversation_idx" ON "ai_task_runs" ("conversation_id", "created_at");

-- Call failure reasons for honest call history.
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "failure_reason" text;

-- Provider kind discriminator (loan | support) for provider chats.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provider_kind" text;
