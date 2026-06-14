ALTER TABLE "hub_user" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "hub_user" ADD CONSTRAINT "hub_user_clerk_user_id_unique" UNIQUE("clerk_user_id");