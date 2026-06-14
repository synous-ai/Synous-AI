CREATE TABLE "prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"search_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"website" text,
	"email" text,
	"rating" numeric(2, 1),
	"user_ratings_total" integer,
	"google_place_id" text,
	"types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_analysis" text,
	"ai_proposal" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"imported_contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_status_check" CHECK ("prospect"."status" IN ('new','imported','discarded'))
);
--> statement-breakpoint
CREATE TABLE "prospect_search" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"query" text NOT NULL,
	"our_services" text,
	"requested_limit" integer DEFAULT 5 NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_search_status_check" CHECK ("prospect_search"."status" IN ('running','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_search_id_prospect_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."prospect_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_imported_contact_id_contact_id_fk" FOREIGN KEY ("imported_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_search" ADD CONSTRAINT "prospect_search_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_search" ADD CONSTRAINT "prospect_search_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prospect_portal" ON "prospect" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "idx_prospect_search" ON "prospect" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "idx_prospect_search_portal" ON "prospect_search" USING btree ("portal_id");