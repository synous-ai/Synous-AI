CREATE TABLE "client_onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"client_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"steps_completed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature_name" text,
	"signature_accepted_at" timestamp with time zone,
	"signature_ip" text,
	"brief_answers" jsonb,
	"materials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_onboarding_deal_id_unique" UNIQUE("deal_id"),
	CONSTRAINT "client_onboarding_status_check" CHECK ("client_onboarding"."status" IN ('in_progress','completed'))
);
--> statement-breakpoint
ALTER TABLE "client_onboarding" ADD CONSTRAINT "client_onboarding_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding" ADD CONSTRAINT "client_onboarding_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding" ADD CONSTRAINT "client_onboarding_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE cascade ON UPDATE no action;