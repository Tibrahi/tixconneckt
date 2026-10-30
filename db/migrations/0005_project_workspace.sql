-- TIXCONNECKT migration 0005: dynamic project workspace (Specification/Project.md).
--
-- All statements are idempotent and non-destructive: no existing data is
-- altered or dropped. Existing projects keep working; workspace folders are
-- created for them lazily on first open.

CREATE TABLE IF NOT EXISTS "project_folders" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "parent_folder_id" text,
  "name" text NOT NULL,
  "description" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_folder_project_idx" ON "project_folders" ("project_id", "parent_folder_id");
CREATE INDEX IF NOT EXISTS "project_folder_meta_gin" ON "project_folders" USING gin ("metadata");

CREATE TABLE IF NOT EXISTS "project_files" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "folder_id" text NOT NULL REFERENCES "project_folders"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "document_type" text NOT NULL DEFAULT 'document',
  "content_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "text_cache" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attachment_id" text,
  "version_number" integer NOT NULL DEFAULT 1,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_file_project_idx" ON "project_files" ("project_id", "folder_id");
CREATE INDEX IF NOT EXISTS "project_file_updated_idx" ON "project_files" ("project_id", "updated_at");
CREATE INDEX IF NOT EXISTS "project_file_meta_gin" ON "project_files" USING gin ("metadata");

CREATE TABLE IF NOT EXISTS "project_file_versions" (
  "id" text PRIMARY KEY,
  "file_id" text NOT NULL REFERENCES "project_files"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "title" text NOT NULL,
  "content_json" jsonb NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_file_version_unique" ON "project_file_versions" ("file_id", "version_number");
CREATE INDEX IF NOT EXISTS "project_file_version_file_idx" ON "project_file_versions" ("file_id", "version_number");

CREATE TABLE IF NOT EXISTS "project_members" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'viewer',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_member_unique" ON "project_members" ("project_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_member_user_idx" ON "project_members" ("user_id");

CREATE TABLE IF NOT EXISTS "project_activity" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "actor_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_activity_project_idx" ON "project_activity" ("project_id", "created_at");

CREATE TABLE IF NOT EXISTS "project_shares" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "request_id" text REFERENCES "funding_requests"("id") ON DELETE CASCADE,
  "provider_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission" text NOT NULL DEFAULT 'view',
  "file_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "folder_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "granted_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_share_project_idx" ON "project_shares" ("project_id", "provider_id");
CREATE INDEX IF NOT EXISTS "project_share_request_idx" ON "project_shares" ("request_id");

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY,
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "website" text,
  "country" text,
  "contact_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "logo_document_id" text,
  "visibility" text NOT NULL DEFAULT 'public',
  "verification_status" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "organization_owner_idx" ON "organizations" ("owner_id");
CREATE INDEX IF NOT EXISTS "organization_visibility_idx" ON "organizations" ("visibility");

CREATE TABLE IF NOT EXISTS "organization_verifications" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "evidence_document_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewer_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "organization_verification_org_idx" ON "organization_verifications" ("organization_id", "created_at");
