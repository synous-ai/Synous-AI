-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "portal" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"time_zone" text DEFAULT 'America/Bogota' NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_user" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"email" "citext" NOT NULL,
	"first_name" text,
	"last_name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_user_portal_id_email_unique" UNIQUE("portal_id","email"),
	CONSTRAINT "hub_user_role_check" CHECK ("hub_user"."role" IN ('owner','member','viewer'))
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"probability" numeric(5, 4),
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"exit_criteria" text,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stage_probability_check" CHECK ("pipeline_stage"."probability" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"phone" text,
	"website" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"owner_id" text,
	"company_id" text,
	"first_name" text,
	"last_name" text,
	"email" "citext",
	"phone" text,
	"job_title" text,
	"lifecycle_stage" text DEFAULT 'lead' NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_portal_id_email_unique" UNIQUE("portal_id","email"),
	CONSTRAINT "contact_lifecycle_stage_check" CHECK ("contact"."lifecycle_stage" IN ('lead','mql','sql','opportunity','customer','other'))
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"owner_id" text,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"primary_contact_id" text,
	"company_id" text,
	"name" text NOT NULL,
	"amount" numeric(12, 2),
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"close_date" date,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_contact" (
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_contact_deal_id_contact_id_pk" PRIMARY KEY("deal_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "availability_block" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	CONSTRAINT "availability_block_time_check" CHECK ("availability_block"."ends_at" > "availability_block"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "availability_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"time_zone" text DEFAULT 'America/Bogota' NOT NULL,
	CONSTRAINT "availability_rule_day_of_week_check" CHECK ("availability_rule"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "availability_rule_time_check" CHECK ("availability_rule"."end_time" > "availability_rule"."start_time")
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_type_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"contact_id" text,
	"deal_id" text,
	"guest_name" text NOT NULL,
	"guest_email" "citext" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"meet_link" text,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_status_check" CHECK ("booking"."status" IN ('confirmed','cancelled','rescheduled')),
	CONSTRAINT "booking_time_check" CHECK ("booking"."ends_at" > "booking"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "meeting_type" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"buffer_min" integer DEFAULT 10 NOT NULL,
	"location" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "meeting_type_portal_id_slug_unique" UNIQUE("portal_id","slug"),
	CONSTRAINT "meeting_type_duration_min_check" CHECK ("meeting_type"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "call" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"created_by" text,
	"title" text,
	"body" text,
	"direction" text,
	"duration_sec" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deal_id" text,
	"contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_direction_check" CHECK ("call"."direction" IN ('inbound','outbound'))
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"created_by" text,
	"booking_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"location" text,
	"deal_id" text,
	"contact_id" text,
	"fathom_summary" text,
	"fathom_transcript_url" text,
	"fathom_action_items" jsonb,
	"fathom_participants" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"created_by" text,
	"body" text NOT NULL,
	"deal_id" text,
	"contact_id" text,
	"company_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"created_by" text,
	"assigned_to" text,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deal_id" text,
	"contact_id" text,
	"company_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_status_check" CHECK ("task"."status" IN ('pending','in_progress','completed','cancelled')),
	CONSTRAINT "task_priority_check" CHECK ("task"."priority" IN ('low','medium','high'))
);
--> statement-breakpoint
CREATE TABLE "record_history" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"source_type" text,
	"source_id" text,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_list" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"processing_type" text DEFAULT 'MANUAL' NOT NULL,
	"filter_branch" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_list_entity_type_check" CHECK ("crm_list"."entity_type" IN ('contact','company','deal')),
	CONSTRAINT "crm_list_processing_type_check" CHECK ("crm_list"."processing_type" IN ('MANUAL','DYNAMIC'))
);
--> statement-breakpoint
CREATE TABLE "list_membership" (
	"list_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_membership_list_id_entity_id_pk" PRIMARY KEY("list_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "client_account" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"invite_token" text,
	"invite_sent_at" timestamp with time zone,
	"invite_accepted" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_account_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "client_account_portal_id_email_unique" UNIQUE("portal_id","email")
);
--> statement-breakpoint
CREATE TABLE "client_deal_access" (
	"client_id" text NOT NULL,
	"deal_id" text NOT NULL,
	CONSTRAINT "client_deal_access_client_id_deal_id_pk" PRIMARY KEY("client_id","deal_id")
);
--> statement-breakpoint
CREATE TABLE "client_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"client_id" text NOT NULL,
	"intake_id" text,
	"field_name" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"mime_type" text,
	"storage_key" text NOT NULL,
	"size_bytes" bigint,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_asset_type_check" CHECK ("client_asset"."type" IN ('logo','foto','documento','acceso','otro'))
);
--> statement-breakpoint
CREATE TABLE "deal_intake" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"form_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_intake_status_check" CHECK ("deal_intake"."status" IN ('pending','in_progress','completed'))
);
--> statement-breakpoint
CREATE TABLE "deal_intake_response" (
	"id" text PRIMARY KEY NOT NULL,
	"intake_id" text NOT NULL,
	"client_id" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_intake_response_intake_id_unique" UNIQUE("intake_id")
);
--> statement-breakpoint
CREATE TABLE "intake_form" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_form_portal_id_slug_unique" UNIQUE("portal_id","slug")
);
--> statement-breakpoint
CREATE TABLE "deliverable" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"feedback" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverable_type_check" CHECK ("deliverable"."type" IN ('design','prototype','staging','final')),
	CONSTRAINT "deliverable_status_check" CHECK ("deliverable"."status" IN ('pending_review','approved','changes_requested'))
);
--> statement-breakpoint
CREATE TABLE "change_request" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"original_scope_ref" text,
	"origin" text DEFAULT 'client' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"total_amount" numeric(12, 2),
	"timeline_impact_days" integer DEFAULT 0 NOT NULL,
	"new_delivery_date" date,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"completed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_request_deal_id_number_unique" UNIQUE("deal_id","number"),
	CONSTRAINT "change_request_origin_check" CHECK ("change_request"."origin" IN ('client','agency')),
	CONSTRAINT "change_request_status_check" CHECK ("change_request"."status" IN ('draft','sent','approved','rejected','negotiating','approved_verbally','disputed','completed'))
);
--> statement-breakpoint
CREATE TABLE "change_request_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"change_request_id" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_request_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"change_request_id" text NOT NULL,
	"body" text NOT NULL,
	"author_user" text,
	"author_client" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_request_comment_author_check" CHECK (("change_request_comment"."author_user" IS NOT NULL AND "change_request_comment"."author_client" IS NULL) OR ("change_request_comment"."author_user" IS NULL AND "change_request_comment"."author_client" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "change_request_history" (
	"id" text PRIMARY KEY NOT NULL,
	"change_request_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"comment" text,
	"changed_by_user" text,
	"changed_by_client" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_request_item" (
	"id" text PRIMARY KEY NOT NULL,
	"change_request_id" text NOT NULL,
	"description" text NOT NULL,
	"hours" numeric(6, 2),
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" numeric(8, 2) DEFAULT '1' NOT NULL,
	"subtotal" numeric(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text,
	"cr_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"source" text,
	"docuseal_submission_id" integer,
	"docuseal_template_id" integer,
	"docuseal_status" text,
	"docuseal_external_id" text,
	"storage_key" text,
	"signed_at" timestamp with time zone,
	"signed_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_docuseal_external_id_unique" UNIQUE("docuseal_external_id"),
	CONSTRAINT "document_type_check" CHECK ("document"."type" IN ('contract','proposal','invoice','other')),
	CONSTRAINT "document_source_check" CHECK ("document"."source" IN ('docuseal','manual','generated')),
	CONSTRAINT "document_docuseal_status_check" CHECK ("document"."docuseal_status" IN ('pending','completed','declined','expired'))
);
--> statement-breakpoint
CREATE TABLE "email_event" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"type" text NOT NULL,
	"link_url" text,
	"user_agent" text,
	"ip_address" "inet",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_event_type_check" CHECK ("email_event"."type" IN ('opened','clicked','bounced','unsubscribed'))
);
--> statement-breakpoint
CREATE TABLE "email_send" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"contact_id" text,
	"deal_id" text,
	"from_email" "citext" NOT NULL,
	"to_email" "citext" NOT NULL,
	"subject" text NOT NULL,
	"body_html" text,
	"tracking_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"entity_type" text,
	"entity_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"action_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"entity_type" text,
	"entity_id" text,
	"action" text NOT NULL,
	"payload" jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_item" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"name" text NOT NULL,
	"description" text,
	"storage_key" text,
	"url" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_item_type_check" CHECK ("library_item"."type" IN ('document','sop','template','contract_base','proposal_base','checklist','tech_doc'))
);
--> statement-breakpoint
CREATE TABLE "work_item" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"deal_id" text,
	"assigned_to" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_type_check" CHECK ("work_item"."type" IN ('bug','improvement','roadmap','process')),
	CONSTRAINT "work_item_status_check" CHECK ("work_item"."status" IN ('open','in_progress','done','cancelled')),
	CONSTRAINT "work_item_priority_check" CHECK ("work_item"."priority" IN ('low','medium','high'))
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"number" integer NOT NULL,
	"deal_id" text,
	"company_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" IN ('draft','sent','paid','overdue','void'))
);
--> statement-breakpoint
CREATE TABLE "invoice_item" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text DEFAULT 'transfer' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_method_check" CHECK ("payment"."method" IN ('transfer','card','cash','other'))
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_pref_user_id_event_type_unique" UNIQUE("user_id","event_type")
);
--> statement-breakpoint
CREATE TABLE "custom_field" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"options" jsonb DEFAULT 'null'::jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_portal_entity_key_unique" UNIQUE("portal_id","entity_type","key"),
	CONSTRAINT "custom_field_entity_type_check" CHECK ("custom_field"."entity_type" IN ('contact','deal','company')),
	CONSTRAINT "custom_field_field_type_check" CHECK ("custom_field"."field_type" IN ('text','number','date','select','boolean'))
);
--> statement-breakpoint
ALTER TABLE "hub_user" ADD CONSTRAINT "hub_user_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_primary_contact_id_contact_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contact" ADD CONSTRAINT "deal_contact_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contact" ADD CONSTRAINT "deal_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_block" ADD CONSTRAINT "availability_block_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_meeting_type_id_meeting_type_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assigned_to_hub_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_history" ADD CONSTRAINT "record_history_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_history" ADD CONSTRAINT "record_history_changed_by_hub_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_list" ADD CONSTRAINT "crm_list_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_list_id_crm_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."crm_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_deal_access" ADD CONSTRAINT "client_deal_access_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_deal_access" ADD CONSTRAINT "client_deal_access_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_asset" ADD CONSTRAINT "client_asset_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_asset" ADD CONSTRAINT "client_asset_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_asset" ADD CONSTRAINT "client_asset_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_asset" ADD CONSTRAINT "client_asset_intake_id_deal_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."deal_intake"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intake" ADD CONSTRAINT "deal_intake_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intake" ADD CONSTRAINT "deal_intake_form_id_intake_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_form"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intake_response" ADD CONSTRAINT "deal_intake_response_intake_id_deal_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."deal_intake"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_intake_response" ADD CONSTRAINT "deal_intake_response_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form" ADD CONSTRAINT "intake_form_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_reviewed_by_client_account_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable" ADD CONSTRAINT "deliverable_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_approved_by_client_account_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD CONSTRAINT "change_request_attachment_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_attachment" ADD CONSTRAINT "change_request_attachment_uploaded_by_hub_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_comment" ADD CONSTRAINT "change_request_comment_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_comment" ADD CONSTRAINT "change_request_comment_author_user_hub_user_id_fk" FOREIGN KEY ("author_user") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_comment" ADD CONSTRAINT "change_request_comment_author_client_client_account_id_fk" FOREIGN KEY ("author_client") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_changed_by_user_hub_user_id_fk" FOREIGN KEY ("changed_by_user") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_changed_by_client_client_account_id_fk" FOREIGN KEY ("changed_by_client") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_item" ADD CONSTRAINT "change_request_item_change_request_id_change_request_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_cr_id_change_request_id_fk" FOREIGN KEY ("cr_id") REFERENCES "public"."change_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_signed_by_client_account_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_email_id_email_send_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email_send"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_hub_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_hub_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_client_id_client_account_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_assigned_to_hub_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_user_id_hub_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stage_pipeline" ON "pipeline_stage" USING btree ("pipeline_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_company_portal" ON "company" USING btree ("portal_id") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "idx_company_owner" ON "company" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_contact_portal" ON "contact" USING btree ("portal_id") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "idx_contact_company" ON "contact" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_contact_owner" ON "contact" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_contact_email" ON "contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_deal_portal" ON "deal" USING btree ("portal_id") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "idx_deal_pipeline" ON "deal" USING btree ("pipeline_id","stage_id");--> statement-breakpoint
CREATE INDEX "idx_deal_owner" ON "deal" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_deal_contact" ON "deal" USING btree ("primary_contact_id");--> statement-breakpoint
CREATE INDEX "idx_deal_company" ON "deal" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_deal_contact_contact" ON "deal_contact" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_booking_owner_time" ON "booking" USING btree ("owner_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_booking_deal" ON "booking" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_call_deal" ON "call" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_call_contact" ON "call" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_deal" ON "meeting" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_booking" ON "meeting" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_note_deal" ON "note" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_note_contact" ON "note" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignee" ON "task" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "idx_task_due" ON "task" USING btree ("due_date") WHERE status <> 'completed';--> statement-breakpoint
CREATE INDEX "idx_task_deal" ON "task" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_record_history_entity" ON "record_history" USING btree ("entity_type","entity_id","field_name","changed_at");--> statement-breakpoint
CREATE INDEX "idx_client_asset_deal" ON "client_asset" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_deal_intake_deal" ON "deal_intake" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_deliverable_deal" ON "deliverable" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_cr_deal" ON "change_request" USING btree ("deal_id","status");--> statement-breakpoint
CREATE INDEX "idx_cr_comment_cr" ON "change_request_comment" USING btree ("change_request_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cr_item_cr" ON "change_request_item" USING btree ("change_request_id");--> statement-breakpoint
CREATE INDEX "idx_document_deal" ON "document" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_email_event_email" ON "email_event" USING btree ("email_id","type");--> statement-breakpoint
CREATE INDEX "idx_email_send_contact" ON "email_send" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_email_send_tracking" ON "email_send" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "idx_notification_user" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_notification_client" ON "notification" USING btree ("client_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_library_item_portal_type" ON "library_item" USING btree ("portal_id","type");--> statement-breakpoint
CREATE INDEX "idx_work_item_portal_type" ON "work_item" USING btree ("portal_id","type");--> statement-breakpoint
CREATE INDEX "idx_invoice_portal_status" ON "invoice" USING btree ("portal_id","status");--> statement-breakpoint
CREATE INDEX "idx_invoice_item_invoice" ON "invoice_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_portal" ON "payment" USING btree ("portal_id");--> statement-breakpoint
CREATE INDEX "idx_notification_pref_portal_user" ON "notification_pref" USING btree ("portal_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_custom_field_portal_entity" ON "custom_field" USING btree ("portal_id","entity_type");