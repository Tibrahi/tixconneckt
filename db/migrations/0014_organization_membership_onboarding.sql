-- Organization identity and access are scoped records, separate from user roles.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "kind" text;
CREATE INDEX IF NOT EXISTS "organization_kind_idx" ON "organizations" ("kind");

CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'staff',
  "status" text NOT NULL DEFAULT 'active',
  "job_title" text,
  "invited_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organization_member_role_check" CHECK ("role" IN ('owner', 'admin', 'staff')),
  CONSTRAINT "organization_member_status_check" CHECK ("status" IN ('pending', 'active', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_member_unique" ON "organization_members" ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_member_user_status_idx" ON "organization_members" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "organization_member_org_status_idx" ON "organization_members" ("organization_id", "status");

-- Existing organization owners are the only safe membership backfill.
INSERT INTO "organization_members" ("id", "organization_id", "user_id", "role", "status")
SELECT 'owner-' || md5(o."id" || ':' || o."owner_id"), o."id", o."owner_id", 'owner', 'active'
FROM "organizations" o
ON CONFLICT ("organization_id", "user_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "organization_access_requests" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "job_title" text NOT NULL,
  "message" text,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organization_access_request_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_access_request_unique" ON "organization_access_requests" ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_access_request_queue_idx" ON "organization_access_requests" ("organization_id", "status", "created_at");
