CREATE TABLE "project_update" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"stage_id" text,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_update_deal" ON "project_update" USING btree ("deal_id","created_at");