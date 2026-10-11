CREATE TABLE "process_task" (
	"id" text PRIMARY KEY NOT NULL,
	"process_id" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_portal_slug_unique" UNIQUE("portal_id","slug")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text,
	"company_id" text,
	"name" text NOT NULL,
	"kind" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"stage" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"start_date" date,
	"due_date" date,
	"repo_url" text,
	"staging_url" text,
	"production_url" text,
	"notes" text,
	"notes_important" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_status_check" CHECK ("project"."status" IN ('not_started','in_progress','in_review','waiting_client','on_hold','delivered')),
	CONSTRAINT "project_stage_check" CHECK ("project"."stage" IS NULL OR "project"."stage" IN ('discovery','design','development','qa','client_review','changes','delivery')),
	CONSTRAINT "project_priority_check" CHECK ("project"."priority" IN ('low','medium','high'))
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"project_id" text NOT NULL,
	"hub_user_id" text NOT NULL,
	CONSTRAINT "project_member_project_id_hub_user_id_pk" PRIMARY KEY("project_id","hub_user_id")
);
--> statement-breakpoint
CREATE TABLE "task_assignee" (
	"task_id" text NOT NULL,
	"hub_user_id" text NOT NULL,
	CONSTRAINT "task_assignee_task_id_hub_user_id_pk" PRIMARY KEY("task_id","hub_user_id")
);
--> statement-breakpoint
CREATE TABLE "team_member_profile" (
	"hub_user_id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"job_title" text,
	"responsibilities" text,
	"autonomous_decisions" text,
	"approval_required" text,
	"work_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_profile_work_status_check" CHECK ("team_member_profile"."work_status" IS NULL OR "team_member_profile"."work_status" IN ('available','working','blocked','waiting_approval'))
);
--> statement-breakpoint
ALTER TABLE "task" DROP CONSTRAINT "task_status_check";--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "process_task" ADD CONSTRAINT "process_task_process_id_process_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."process"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process" ADD CONSTRAINT "process_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_hub_user_id_hub_user_id_fk" FOREIGN KEY ("hub_user_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_hub_user_id_hub_user_id_fk" FOREIGN KEY ("hub_user_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_profile" ADD CONSTRAINT "team_member_profile_hub_user_id_hub_user_id_fk" FOREIGN KEY ("hub_user_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_profile" ADD CONSTRAINT "team_member_profile_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_process_task_process" ON "process_task" USING btree ("process_id","position");--> statement-breakpoint
CREATE INDEX "idx_project_portal_status" ON "project" USING btree ("portal_id","archived","status");--> statement-breakpoint
CREATE INDEX "idx_project_deal" ON "project" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_project_member_user" ON "project_member" USING btree ("hub_user_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignee_user" ON "task_assignee" USING btree ("hub_user_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_project_board" ON "task" USING btree ("project_id","status","position");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_status_check" CHECK ("task"."status" IN ('pending','in_progress','in_review','completed','cancelled','blocked'));