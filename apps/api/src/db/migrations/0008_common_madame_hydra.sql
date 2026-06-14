ALTER TABLE "setter_lead" ADD COLUMN "crm_deal_id" text;--> statement-breakpoint
ALTER TABLE "setter_person" ADD COLUMN "crm_contact_id" text;--> statement-breakpoint
ALTER TABLE "setter_lead" ADD CONSTRAINT "setter_lead_crm_deal_id_deal_id_fk" FOREIGN KEY ("crm_deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_person" ADD CONSTRAINT "setter_person_crm_contact_id_contact_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;