ALTER TABLE "setter_tenant" ADD COLUMN "prospecting_cities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "setter_tenant" ADD COLUMN "prospecting_autopilot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "setter_tenant" ADD COLUMN "prospecting_autopilot_cursor" integer DEFAULT 0 NOT NULL;