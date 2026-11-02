ALTER TABLE "payment_methods" ADD COLUMN "method_option" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "details" jsonb DEFAULT '{}' NOT NULL;
