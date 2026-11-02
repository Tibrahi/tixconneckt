ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "method_option" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "details" jsonb DEFAULT '{}' NOT NULL;
