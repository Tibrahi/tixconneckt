-- TIXCONNECKT migration 0002: 1:1 call records.
--
-- Apply with `npm run db:push` (recommended) or run this file against the
-- target database. Idempotent and non-destructive.

CREATE TABLE IF NOT EXISTS "calls" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "caller_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "callee_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ringing',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "answered_at" timestamptz,
  "ended_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "call_conversation_idx"
  ON "calls" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "call_participant_idx"
  ON "calls" ("callee_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "call_caller_idx"
  ON "calls" ("caller_id", "status", "created_at");
