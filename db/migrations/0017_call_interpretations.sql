-- These migrations originally had timestamps earlier than 0016 in the
-- Drizzle journal, so databases that applied 0016 skipped them as "current".
-- The journal timestamps are corrected; keep this repair idempotent because
-- environments may have recorded the original versions already.
CREATE TABLE IF NOT EXISTS "call_interpretations" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"segment_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_interpretations_call_id_calls_id_fk') THEN
		ALTER TABLE "call_interpretations" ADD CONSTRAINT "call_interpretations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_interpretations_created_by_users_id_fk') THEN
		ALTER TABLE "call_interpretations" ADD CONSTRAINT "call_interpretations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_interpretation_call_idx" ON "call_interpretations" USING btree ("call_id");
