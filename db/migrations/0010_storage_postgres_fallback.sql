ALTER TABLE "documents" ADD COLUMN "data" "bytea";
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "storage_key" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "group_media" ADD COLUMN "data" "bytea";
--> statement-breakpoint
ALTER TABLE "group_media" ALTER COLUMN "storage_key" DROP NOT NULL;
