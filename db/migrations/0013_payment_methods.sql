-- TIXCONNECKT migration 0013: bound payment methods readiness step
-- (role-aware workstream D2). Non-sensitive metadata only — no columns for
-- card numbers, CVV, PINs, or private keys by design. Idempotent.
-- Rollback: DROP TABLE "payment_methods".

CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "display_label" text NOT NULL,
  "provider_ref" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_method_user_idx"
  ON "payment_methods" ("user_id");
