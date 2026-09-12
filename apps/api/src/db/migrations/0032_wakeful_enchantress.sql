ALTER TABLE "portal" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "portal" ADD CONSTRAINT "portal_slug_unique" UNIQUE("slug");