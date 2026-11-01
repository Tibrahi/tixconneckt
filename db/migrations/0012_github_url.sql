-- TIXCONNECKT migration 0012: optional GitHub profile URL on profiles
-- (role-aware workstream D1). Nullable, non-destructive, idempotent.
-- Rollback: ALTER TABLE "profiles" DROP COLUMN "github_url".

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "github_url" text;
