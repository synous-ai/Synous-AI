ALTER TABLE "deliverable" ADD COLUMN "visible_to_client" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "visible_to_client" boolean DEFAULT true NOT NULL;