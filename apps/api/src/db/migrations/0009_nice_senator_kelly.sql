ALTER TABLE "setter_tenant" ADD COLUMN "prospecting_services" text;--> statement-breakpoint
ALTER TABLE "setter_tenant" ADD COLUMN "prospecting_niches" jsonb DEFAULT '[]'::jsonb NOT NULL;