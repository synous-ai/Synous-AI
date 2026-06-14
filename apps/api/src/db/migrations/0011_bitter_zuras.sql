CREATE TABLE "setter_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"lead_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setter_event_level_check" CHECK ("setter_event"."level" IN ('info','success','warn','error'))
);
--> statement-breakpoint
ALTER TABLE "setter_event" ADD CONSTRAINT "setter_event_tenant_id_setter_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."setter_tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_setter_event_tenant_time" ON "setter_event" USING btree ("tenant_id","created_at");