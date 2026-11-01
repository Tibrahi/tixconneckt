-- TIXCONNECKT migration 0011: per-call transcription consent, transcript
-- segments, and per-user call-hide state (role-aware workstream B).
--
-- Apply with `npm run db:push` (recommended) or run this file against the
-- target database. Idempotent and non-destructive. Rollback: DROP TABLE
-- "call_hides", "call_transcripts", "call_transcript_consents" (transcript
-- data is derived and deletable; call records are untouched).

CREATE TABLE IF NOT EXISTS "call_transcript_consents" (
  "id" text PRIMARY KEY,
  "call_id" text NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "consented" boolean NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_consent_call_user_unique"
  ON "call_transcript_consents" ("call_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_consent_call_idx"
  ON "call_transcript_consents" ("call_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_transcripts" (
  "id" text PRIMARY KEY,
  "call_id" text NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "segment_index" integer NOT NULL,
  "speaker" text,
  "text" text NOT NULL,
  "final" boolean NOT NULL DEFAULT true,
  "turn_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_transcript_segment_unique"
  ON "call_transcripts" ("call_id", "segment_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_transcript_call_idx"
  ON "call_transcripts" ("call_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_hides" (
  "id" text PRIMARY KEY,
  "call_id" text NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "hidden_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_hide_call_user_unique"
  ON "call_hides" ("call_id", "user_id");
