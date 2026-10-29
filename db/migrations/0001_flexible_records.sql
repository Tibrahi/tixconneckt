-- TIXCONNECKT migration 0001: JSON-first flexible records (correction §2).
--
-- Apply with `npm run db:push` (recommended, strict schema sync) or run this
-- file against the target database. All statements are idempotent and
-- non-destructive: no existing data is altered or dropped.

CREATE TABLE IF NOT EXISTS "flexible_records" (
  "id" text PRIMARY KEY,
  "record_type" text NOT NULL,
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "visibility" text NOT NULL DEFAULT 'private',
  "group_id" text,
  "doc" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flex_record_owner_type_idx"
  ON "flexible_records" ("owner_id", "record_type", "updated_at");
CREATE INDEX IF NOT EXISTS "flex_record_visibility_idx"
  ON "flexible_records" ("visibility", "record_type", "updated_at");
CREATE INDEX IF NOT EXISTS "flex_record_group_idx"
  ON "flexible_records" ("group_id", "updated_at");
CREATE INDEX IF NOT EXISTS "flex_record_doc_gin"
  ON "flexible_records" USING gin ("doc");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "attributes" jsonb NOT NULL DEFAULT '{}'::jsonb;
