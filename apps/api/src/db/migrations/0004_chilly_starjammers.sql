ALTER TABLE "client_account" ADD COLUMN "brand_slug" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD COLUMN "brand_logo_key" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD COLUMN "brand_primary" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD COLUMN "brand_secondary" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_brand_slug_unique" UNIQUE("brand_slug");