ALTER TABLE "company" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "brand_logo_key" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "brand_primary" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "brand_secondary" text;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_portal_id_slug_unique" UNIQUE("portal_id","slug");