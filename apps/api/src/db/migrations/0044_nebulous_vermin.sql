CREATE TABLE "change_request_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"change_request_id" text NOT NULL,
	"version" integer NOT NULL,
	"scope" text,
	"amount" numeric(12, 2),
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"timeline_impact_days" integer DEFAULT 0 NOT NULL,
	"new_delivery_date" date,
	"note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_client" text,
	CONSTRAINT "uq_cr_proposal_version" UNIQUE("change_request_id","version"),
	CONSTRAINT "change_request_proposal_status_check" CHECK ("change_request_proposal"."status" IN ('draft','sent','superseded','accepted','rejected'))
);
--> statement-breakpoint
ALTER TABLE "change_request" DROP CONSTRAINT "change_request_status_check";--> statement-breakpoint
ALTER TABLE "file_upload" DROP CONSTRAINT "file_upload_purpose_check";--> statement-breakpoint
ALTER TABLE "change_request_history" ALTER COLUMN "to_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverable" ADD COLUMN "change_request_id" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "context" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "proposed_scope" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "currency" char(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "current_proposal_id" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "approved_proposal_id" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "decision_comment" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "created_by_client" text;--> statement-breakpoint
ALTER TABLE "change_request" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD COLUMN "comment_id" text;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD COLUMN "uploaded_by_client" text;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD COLUMN "event_type" text DEFAULT 'status_changed' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "change_request_item" ADD COLUMN "proposal_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "change_request_id" text;--> statement-breakpoint
ALTER TABLE "change_request_proposal" ADD CONSTRAINT "change_request_proposal_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_proposal" ADD CONSTRAINT "change_request_proposal_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_proposal" ADD CONSTRAINT "change_request_proposal_decided_by_client_client_account_id_fk" FOREIGN KEY ("decided_by_client") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cr_proposal_cr_version" ON "change_request_proposal" USING btree ("change_request_id","version" desc);--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_created_by_client_client_account_id_fk" FOREIGN KEY ("created_by_client") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_current_proposal_fk" FOREIGN KEY ("current_proposal_id") REFERENCES "public"."change_request_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_approved_proposal_fk" FOREIGN KEY ("approved_proposal_id") REFERENCES "public"."change_request_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD CONSTRAINT "change_request_attachment_comment_id_change_request_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."change_request_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD CONSTRAINT "change_request_attachment_uploaded_by_client_client_account_id_fk" FOREIGN KEY ("uploaded_by_client") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_item" ADD CONSTRAINT "change_request_item_proposal_id_change_request_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."change_request_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deliverable_change_request" ON "deliverable" USING btree ("change_request_id");--> statement-breakpoint
CREATE INDEX "idx_cr_portal_status_created" ON "change_request" USING btree ("portal_id","status","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cr_deal_client_request" ON "change_request" USING btree ("deal_id","client_request_id") WHERE client_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_cr_attachment_cr" ON "change_request_attachment" USING btree ("change_request_id");--> statement-breakpoint
CREATE INDEX "idx_cr_history_cr" ON "change_request_history" USING btree ("change_request_id","changed_at" desc);--> statement-breakpoint
CREATE INDEX "idx_cr_item_proposal" ON "change_request_item" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_change_request" ON "invoice" USING btree ("change_request_id");--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_priority_check" CHECK ("change_request"."priority" IN ('low','normal','high'));--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_decision_reason_check" CHECK ("change_request"."decision_reason" IN ('cost','timeline','no_longer_needed','requirement_changed','other'));--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_status_check" CHECK ("change_request"."status" IN ('draft','submitted','under_review','sent','negotiating','approved_verbally','approved','disputed','rejected','cancelled','completed'));--> statement-breakpoint
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_event_type_check" CHECK ("change_request_history"."event_type" IN ('created','submitted','review_started','proposal_sent','proposal_updated','status_changed','comment_added','attachment_added','approved','rejected','adjustment_requested','cancelled','completed'));--> statement-breakpoint
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_actor_role_check" CHECK ("change_request_history"."actor_role" IN ('admin','client','system'));--> statement-breakpoint
ALTER TABLE "file_upload" ADD CONSTRAINT "file_upload_purpose_check" CHECK ("file_upload"."purpose" IN ('deal_document','library_item','expense_receipt','proposal_logo','brand_logo','onboarding_material','cr_attachment'));