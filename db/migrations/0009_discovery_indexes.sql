CREATE INDEX "profiles_visibility_idx" ON "profiles" USING btree ("profile_visibility");--> statement-breakpoint
CREATE INDEX "users_status_role_idx" ON "users" USING btree ("status","role");--> statement-breakpoint
CREATE INDEX "provider_link_requested_idx" ON "provider_links" USING btree ("requested_by","status");--> statement-breakpoint
CREATE INDEX "provider_link_individual_idx" ON "provider_links" USING btree ("individual_id","status");