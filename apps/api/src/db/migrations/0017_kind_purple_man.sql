CREATE TABLE "expense" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"amount_base" numeric(14, 2) NOT NULL,
	"category" text NOT NULL,
	"expense_date" date NOT NULL,
	"vendor" text,
	"deal_id" text,
	"company_id" text,
	"payment_method" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"notes" text,
	"storage_key" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_currency_check" CHECK ("expense"."currency" IN ('USD','ARS')),
	CONSTRAINT "expense_category_check" CHECK ("expense"."category" IN ('software','infraestructura','equipo','impuestos','oficina','marketing','otros')),
	CONSTRAINT "expense_payment_method_check" CHECK ("expense"."payment_method" IS NULL OR "expense"."payment_method" IN ('transfer','card','cash','other'))
);
--> statement-breakpoint
CREATE TABLE "retainer" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"company_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"amount_base" numeric(14, 2) NOT NULL,
	"billing_day" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"notes" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainer_currency_check" CHECK ("retainer"."currency" IN ('USD','ARS')),
	CONSTRAINT "retainer_status_check" CHECK ("retainer"."status" IN ('active','paused','cancelled')),
	CONSTRAINT "retainer_billing_day_check" CHECK ("retainer"."billing_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
ALTER TABLE "portal" ALTER COLUMN "time_zone" SET DEFAULT 'America/Argentina/Buenos_Aires';--> statement-breakpoint
ALTER TABLE "availability_rule" ALTER COLUMN "time_zone" SET DEFAULT 'America/Argentina/Buenos_Aires';--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "amount_base" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "amount_base" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_created_by_hub_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."hub_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_expense_portal_date" ON "expense" USING btree ("portal_id","expense_date");--> statement-breakpoint
CREATE INDEX "idx_expense_deal" ON "expense" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_expense_category" ON "expense" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_retainer_portal_status" ON "retainer" USING btree ("portal_id","status");--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_currency_check" CHECK ("invoice"."currency" IN ('USD','ARS'));--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_currency_check" CHECK ("payment"."currency" IN ('USD','ARS'));--> statement-breakpoint

-- Backfill: todas las facturas y pagos existentes eran en USD (exchange_rate = 1).
-- amount_base = total (facturas) / amount (pagos) porque currency = 'USD' → ratio 1:1.
-- Se ejecuta DESPUÉS de agregar las columnas para que los defaults ya estén aplicados.
UPDATE "invoice" SET "amount_base" = "total" WHERE "amount_base" = '0';--> statement-breakpoint
UPDATE "payment" SET "amount_base" = "amount" WHERE "amount_base" = '0';