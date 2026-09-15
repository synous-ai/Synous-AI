CREATE TABLE "document_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_by_client_account_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_document_folder_id_deal" UNIQUE("id","deal_id"),
	CONSTRAINT "document_folder_name_length_check" CHECK (char_length(btrim("document_folder"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "document_folder_creator_check" CHECK (("document_folder"."created_by" IS NOT NULL) <> ("document_folder"."created_by_client_account_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "uploaded_by_client_account_id" text;--> statement-breakpoint
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_created_by_client_account_id_client_account_id_fk" FOREIGN KEY ("created_by_client_account_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_folder_deal" ON "document_folder" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_folder_deal_name" ON "document_folder" USING btree ("deal_id",lower("name")) WHERE archived = false;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_client_account_id_client_account_id_fk" FOREIGN KEY ("uploaded_by_client_account_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_folder_deal_fk" FOREIGN KEY ("folder_id","deal_id") REFERENCES "public"."document_folder"("id","deal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_folder" ON "document" USING btree ("folder_id") WHERE archived = false;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_creator_check" CHECK (NOT ("document"."created_by" IS NOT NULL AND "document"."uploaded_by_client_account_id" IS NOT NULL));