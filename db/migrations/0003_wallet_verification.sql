-- TIXCONNECKT migration 0003: account & transaction verification (wallet.md).
--
-- Apply with `npm run db:push` (recommended, strict schema sync) or run this
-- file against the target database. All statements are idempotent and
-- non-destructive: no existing data is altered or dropped.

-- Provider transaction reference on ledger entries (duplicate detection).
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "provider_ref" text;
CREATE INDEX IF NOT EXISTS "ledger_provider_ref_idx" ON "ledger_entries" ("provider_ref");
-- The same provider transaction must never be credited twice (NULLs ignored).
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_provider_ref_unique"
  ON "ledger_entries" ("provider_ref") WHERE "provider_ref" IS NOT NULL;

-- Payout provider tracking on withdrawals.
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'tixlpay';
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "provider_reference" text;
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "provider_status" text NOT NULL DEFAULT 'awaiting_review';
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "failure_reason" text;
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz;
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_idempotency_unique" ON "withdrawals" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "withdrawal_provider_ref_idx" ON "withdrawals" ("provider_reference");

-- Per-member savings account configuration (FR-06).
CREATE TABLE IF NOT EXISTS "member_accounts" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "currency" text NOT NULL DEFAULT 'RWF',
  "savings_target_minor" integer,
  "min_contribution_minor" integer,
  "max_contribution_minor" integer,
  "min_withdrawal_minor" integer,
  "start_date" timestamptz,
  "target_date" timestamptz,
  "frequency" text NOT NULL DEFAULT 'monthly',
  "withdrawal_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notify_email" boolean NOT NULL DEFAULT true,
  "notify_in_app" boolean NOT NULL DEFAULT true,
  "visibility" text NOT NULL DEFAULT 'private',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
