ALTER TABLE "client_asset" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_asset" ADD COLUMN "archived_at" timestamp with time zone;