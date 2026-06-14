CREATE INDEX "idx_note_company" ON "note" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_task_contact" ON "task" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_task_company" ON "task" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_task_portal" ON "task" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "idx_notification_portal_user" ON "notification" USING btree ("portal_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_work_item_portal" ON "work_item" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_deal" ON "invoice" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_company" ON "invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_setter_draft_tenant" ON "setter_draft" USING btree ("tenant_id");