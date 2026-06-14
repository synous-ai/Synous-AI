CREATE TABLE "onboarding_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision" text NOT NULL,
	"contact_id" text,
	"deal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_submission_decision_check" CHECK ("onboarding_submission"."decision" IN ('call','proposal'))
);
--> statement-breakpoint
ALTER TABLE "onboarding_submission" ADD CONSTRAINT "onboarding_submission_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submission" ADD CONSTRAINT "onboarding_submission_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_submission" ADD CONSTRAINT "onboarding_submission_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_onboarding_submission_portal" ON "onboarding_submission" USING btree ("portal_id");