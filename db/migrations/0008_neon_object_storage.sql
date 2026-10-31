ALTER TABLE "profile_media" ADD COLUMN "storage_key" text;
--> statement-breakpoint
ALTER TABLE "profile_media" ALTER COLUMN "data" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "group_media" (
  "group_id" text NOT NULL REFERENCES "groups"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "content_type" text NOT NULL,
  "storage_key" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "group_media_group_kind_unique" ON "group_media" USING btree ("group_id", "kind");
