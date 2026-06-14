DROP INDEX "idx_contact_portal";--> statement-breakpoint
DROP INDEX "idx_deal_portal";--> statement-breakpoint
DROP INDEX "idx_task_portal";--> statement-breakpoint
CREATE INDEX "idx_contact_portal_created" ON "contact" USING btree ("portal_id","created_at","id") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "idx_deal_portal_created" ON "deal" USING btree ("portal_id","created_at","id") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "idx_task_portal_created" ON "task" USING btree ("portal_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_email_send_deal" ON "email_send" USING btree ("deal_id","sent_at");