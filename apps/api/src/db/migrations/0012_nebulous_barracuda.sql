CREATE TABLE "proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text,
	"contact_id" text,
	"onboarding_submission_id" text,
	"token" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"model" text,
	"amount" numeric(12, 2),
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"accepted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_status_check" CHECK ("proposal"."status" IN ('draft','accepted','sent','viewed'))
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_onboarding_submission_id_onboarding_submission_id_fk" FOREIGN KEY ("onboarding_submission_id") REFERENCES "public"."onboarding_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proposal_portal" ON "proposal" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_token" ON "proposal" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_proposal_deal" ON "proposal" USING btree ("deal_id");