-- Group call roster and individual join/leave status. Existing one-to-one
-- calls are backfilled without changing their lifecycle or transcript data.
CREATE TABLE IF NOT EXISTS "call_participants" (
  "id" text PRIMARY KEY,
  "call_id" text NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'participant',
  "status" text NOT NULL DEFAULT 'invited',
  "invited_at" timestamptz NOT NULL DEFAULT now(),
  "joined_at" timestamptz,
  "left_at" timestamptz,
  CONSTRAINT "call_participant_role_check" CHECK ("role" IN ('caller', 'participant')),
  CONSTRAINT "call_participant_status_check" CHECK ("status" IN ('invited', 'accepted', 'declined', 'left', 'missed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_participant_call_user_unique"
  ON "call_participants" ("call_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_participant_user_status_idx"
  ON "call_participants" ("user_id", "status", "invited_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_participant_call_status_idx"
  ON "call_participants" ("call_id", "status");
--> statement-breakpoint
INSERT INTO "call_participants" ("id", "call_id", "user_id", "role", "status", "joined_at")
SELECT 'caller-' || md5(c."id"), c."id", c."caller_id", 'caller',
       'accepted',
       c."answered_at"
FROM "calls" c
ON CONFLICT ("call_id", "user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "call_participants" ("id", "call_id", "user_id", "role", "status", "joined_at", "left_at")
SELECT 'callee-' || md5(c."id"), c."id", c."callee_id", 'participant',
       CASE WHEN c."answered_at" IS NOT NULL THEN 'accepted'
            WHEN c."status" = 'declined' THEN 'declined'
            WHEN c."status" = 'missed' THEN 'missed'
            ELSE 'invited' END,
       c."answered_at", c."ended_at"
FROM "calls" c
ON CONFLICT ("call_id", "user_id") DO NOTHING;
