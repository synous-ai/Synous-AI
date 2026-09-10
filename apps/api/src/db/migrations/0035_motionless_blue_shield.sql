ALTER TABLE "company" DROP CONSTRAINT "company_portal_id_slug_unique";--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_slug_unique" UNIQUE("slug");