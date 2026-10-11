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
ALTER TABLE "team_member_profile" ADD CONSTRAINT "team_member_profile_hub_user_id_hub_user_id_fk" FOREIGN KEY ("hub_user_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_profile" ADD CONSTRAINT "team_member_profile_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;