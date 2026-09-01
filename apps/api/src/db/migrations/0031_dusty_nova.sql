CREATE TABLE "booking_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_reminder_booking_kind_unique" UNIQUE("booking_id","kind"),
	CONSTRAINT "booking_reminder_kind_check" CHECK ("booking_reminder"."kind" IN ('24h','1h'))
);
--> statement-breakpoint
ALTER TABLE "booking_reminder" ADD CONSTRAINT "booking_reminder_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;