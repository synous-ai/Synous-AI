CREATE TABLE "file_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_by_client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_at" timestamp with time zone,
	CONSTRAINT "file_upload_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "file_upload_purpose_check" CHECK ("file_upload"."purpose" IN ('deal_document','library_item','expense_receipt','proposal_logo','brand_logo','onboarding_material')),
	CONSTRAINT "file_upload_status_check" CHECK ("file_upload"."status" IN ('pending','attached')),
	CONSTRAINT "file_upload_single_uploader_check" CHECK (("file_upload"."uploaded_by_user_id" IS NULL) <> ("file_upload"."uploaded_by_client_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "file_upload" ADD CONSTRAINT "file_upload_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload" ADD CONSTRAINT "file_upload_uploaded_by_user_id_hub_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload" ADD CONSTRAINT "file_upload_uploaded_by_client_id_client_account_id_fk" FOREIGN KEY ("uploaded_by_client_id") REFERENCES "public"."client_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_file_upload_portal_status_created" ON "file_upload" USING btree ("portal_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_company_brand_logo_key" ON "company" USING btree ("brand_logo_key");--> statement-breakpoint
CREATE INDEX "idx_client_account_brand_logo_key" ON "client_account" USING btree ("brand_logo_key");--> statement-breakpoint
CREATE INDEX "idx_client_asset_storage_key" ON "client_asset" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "idx_cr_attachment_storage_key" ON "change_request_attachment" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "idx_document_storage_key" ON "document" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "idx_library_item_storage_key" ON "library_item" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "idx_expense_storage_key" ON "expense" USING btree ("storage_key");