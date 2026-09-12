-- ==========================================================================
-- Limpieza previa: notificaciones SIN destinatario.
--
-- El check `notification_recipient_check` de abajo exige exactamente un
-- destinatario (user_id XOR client_id). Antes de él se podían insertar filas
-- con los dos en NULL — y se insertaron: 14 en la base de desarrollo. Ninguna
-- query de listado las matchea nunca (todas filtran por user_id o client_id),
-- así que son invisibles para la aplicación: no se "pierden" datos que alguien
-- pudiera llegar a ver.
--
-- Ya había un comentario en onboarding.service.ts advirtiendo de este caso
-- exacto; a partir de esta migración lo impide la base en vez de depender de
-- que cada nuevo call site lo recuerde.
--
-- Se borran en vez de archivarse: `notification` no tiene columna `archived`
-- (no es una entidad del CRM sino un registro de entrega), y sin borrarlas el
-- constraint no se puede crear.
DELETE FROM "notification" WHERE "user_id" IS NULL AND "client_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_notification_user_created" ON "notification" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_notification_client_created" ON "notification" USING btree ("client_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_dedupe" ON "notification" USING btree ("portal_id","dedupe_key") WHERE dedupe_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_priority_check" CHECK ("notification"."priority" IN ('low','normal','high','urgent'));--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_check" CHECK (("notification"."user_id" IS NOT NULL AND "notification"."client_id" IS NULL) OR ("notification"."user_id" IS NULL AND "notification"."client_id" IS NOT NULL));