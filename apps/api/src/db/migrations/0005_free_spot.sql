CREATE TABLE "setter_appointment" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"calendar_ref" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_appointment_status_check" CHECK ("setter_appointment"."status" IN ('confirmed','cancelled','no_show','rescheduled'))
);
--> statement-breakpoint
CREATE TABLE "setter_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"person_id" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setter_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"content" text NOT NULL,
	"edited_content" text,
	"beat" text,
	"format" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tool_calls" jsonb,
	"sent_message_id" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_draft_format_check" CHECK ("setter_draft"."format" IN ('text','voice')),
	CONSTRAINT "setter_draft_status_check" CHECK ("setter_draft"."status" IN ('pending','approved','edited','rejected','sent'))
);
--> statement-breakpoint
CREATE TABLE "setter_lead" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"person_id" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"qualification" jsonb,
	"source" text,
	"window_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_lead_status_check" CHECK ("setter_lead"."status" IN ('NEW','CONTACTED','ENGAGED','QUALIFYING','QUALIFIED','BOOKING','BOOKED','NOT_INTERESTED','HANDED_OFF','OPTED_OUT'))
);
--> statement-breakpoint
CREATE TABLE "setter_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"message_id" text,
	"beat" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_message_role_check" CHECK ("setter_message"."role" IN ('user','assistant','system','tool'))
);
--> statement-breakpoint
CREATE TABLE "setter_person" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text,
	"phone" text,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setter_tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"business_brief" text NOT NULL,
	"agent_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"operation_mode" text DEFAULT 'shadow' NOT NULL,
	"evolution_instance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_tenant_operation_mode_check" CHECK ("setter_tenant"."operation_mode" IN ('shadow','hybrid','autopilot'))
);
--> statement-breakpoint
ALTER TABLE "setter_appointment" ADD CONSTRAINT "setter_appointment_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_appointment" ADD CONSTRAINT "setter_appointment_lead_id_setter_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."setter_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_conversation" ADD CONSTRAINT "setter_conversation_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_conversation" ADD CONSTRAINT "setter_conversation_person_id_setter_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."setter_person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_draft" ADD CONSTRAINT "setter_draft_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_draft" ADD CONSTRAINT "setter_draft_conversation_id_setter_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."setter_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_draft" ADD CONSTRAINT "setter_draft_lead_id_setter_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."setter_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_draft" ADD CONSTRAINT "setter_draft_sent_message_id_setter_message_id_fk" FOREIGN KEY ("sent_message_id") REFERENCES "public"."setter_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_draft" ADD CONSTRAINT "setter_draft_approved_by_hub_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."hub_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_lead" ADD CONSTRAINT "setter_lead_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_lead" ADD CONSTRAINT "setter_lead_person_id_setter_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."setter_person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_message" ADD CONSTRAINT "setter_message_conversation_id_setter_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."setter_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_person" ADD CONSTRAINT "setter_person_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_setter_appointment_lead" ON "setter_appointment" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_setter_conversation_person" ON "setter_conversation" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_setter_draft_status" ON "setter_draft" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_setter_draft_conversation" ON "setter_draft" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_setter_lead_person" ON "setter_lead" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_setter_lead_status" ON "setter_lead" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_setter_lead_window" ON "setter_lead" USING btree ("window_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_setter_message_message_id" ON "setter_message" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_setter_message_conversation" ON "setter_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_setter_person_tenant_phone" ON "setter_person" USING btree ("tenant_id","phone");