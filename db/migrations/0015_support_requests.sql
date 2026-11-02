-- Non-financial support has its own lifecycle and does not share funding states.
CREATE TABLE IF NOT EXISTS "support_requests" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "requester_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requester_group_id" text REFERENCES "groups"("id") ON DELETE SET NULL,
  "target_organization_id" text REFERENCES "organizations"("id") ON DELETE SET NULL,
  "target_provider_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "service_category" text NOT NULL,
  "summary" text NOT NULL,
  "details" text,
  "status" text NOT NULL DEFAULT 'pending',
  "priority" text NOT NULL DEFAULT 'normal',
  "assigned_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "decision_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  CONSTRAINT "support_request_one_recipient_check" CHECK (("target_organization_id" IS NOT NULL)::int + ("target_provider_id" IS NOT NULL)::int = 1),
  CONSTRAINT "support_request_status_check" CHECK ("status" IN ('pending_group_approval', 'pending', 'triage', 'awaiting_requester', 'accepted', 'declined', 'resolved', 'withdrawn')),
  CONSTRAINT "support_request_priority_check" CHECK ("priority" IN ('normal', 'high'))
);
CREATE INDEX IF NOT EXISTS "support_request_project_idx" ON "support_requests" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_request_requester_idx" ON "support_requests" ("requester_user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "support_request_org_queue_idx" ON "support_requests" ("target_organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "support_request_provider_queue_idx" ON "support_requests" ("target_provider_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "support_request_assignee_idx" ON "support_requests" ("assigned_user_id", "status");

CREATE TABLE IF NOT EXISTS "support_request_events" (
  "id" text PRIMARY KEY,
  "request_id" text NOT NULL REFERENCES "support_requests"("id") ON DELETE CASCADE,
  "actor_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "event" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_request_event_timeline_idx" ON "support_request_events" ("request_id", "created_at");

CREATE TABLE IF NOT EXISTS "support_request_documents" (
  "id" text PRIMARY KEY,
  "request_id" text NOT NULL REFERENCES "support_requests"("id") ON DELETE CASCADE,
  "document_id" text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "granted_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission" text NOT NULL DEFAULT 'view',
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "support_request_document_permission_check" CHECK ("permission" = 'view')
);
CREATE UNIQUE INDEX IF NOT EXISTS "support_request_document_unique" ON "support_request_documents" ("request_id", "document_id");
CREATE INDEX IF NOT EXISTS "support_request_document_lookup_idx" ON "support_request_documents" ("request_id", "expires_at");

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "support_request_id" text REFERENCES "support_requests"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_support_request_unique" ON "conversations" ("support_request_id");

-- Group-request approval reuses the existing group approvals table.
