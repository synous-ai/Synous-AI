ALTER TABLE "library_item" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "library_item" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;