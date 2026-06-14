ALTER TABLE "client_account" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_clerk_user_id_unique" UNIQUE("clerk_user_id");