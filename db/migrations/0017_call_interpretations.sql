CREATE TABLE "call_interpretations" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"segment_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_interpretations" ADD CONSTRAINT "call_interpretations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_interpretations" ADD CONSTRAINT "call_interpretations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_interpretation_call_idx" ON "call_interpretations" USING btree ("call_id");
