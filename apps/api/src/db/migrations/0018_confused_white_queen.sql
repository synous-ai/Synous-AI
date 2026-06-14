ALTER TABLE "invoice" ADD COLUMN "retainer_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_retainer_id_retainer_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_retainer" ON "invoice" USING btree ("retainer_id");