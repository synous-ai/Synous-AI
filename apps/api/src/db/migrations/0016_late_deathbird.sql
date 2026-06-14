CREATE TABLE "availability_interval" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "availability_interval_day_check" CHECK ("availability_interval"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "availability_interval_time_check" CHECK ("availability_interval"."end_time" > "availability_interval"."start_time")
);
--> statement-breakpoint
CREATE TABLE "availability_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"portal_id" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_override" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"date" date NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "date_override_schedule_date_unique" UNIQUE("schedule_id","date")
);
--> statement-breakpoint
CREATE TABLE "event_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_type_id" text NOT NULL,
	"host_id" text NOT NULL,
	CONSTRAINT "event_membership_meeting_host_unique" UNIQUE("meeting_type_id","host_id")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "invitee_time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "question_answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "guest_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancel_token" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reschedule_token" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "rescheduled_from_id" text;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "kind" text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "pooling_type" text;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "color" text DEFAULT '#3b82f6';--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "secret" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "custom_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "start_time_increment_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "min_booking_notice_min" integer DEFAULT 240 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "booking_window_type" text DEFAULT 'rolling' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "booking_window_days" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "booking_window_start" date;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "booking_window_end" date;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "buffer_before_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "buffer_after_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "daily_limit" integer;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "max_invitees" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD COLUMN "availability_schedule_id" text;--> statement-breakpoint
ALTER TABLE "availability_interval" ADD CONSTRAINT "availability_interval_schedule_id_availability_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."availability_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_schedule" ADD CONSTRAINT "availability_schedule_owner_id_hub_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_schedule" ADD CONSTRAINT "availability_schedule_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_override" ADD CONSTRAINT "date_override_schedule_id_availability_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."availability_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_membership" ADD CONSTRAINT "event_membership_meeting_type_id_meeting_type_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_membership" ADD CONSTRAINT "event_membership_host_id_hub_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hub_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_availability_interval_schedule_day" ON "availability_interval" USING btree ("schedule_id","day_of_week");--> statement-breakpoint
CREATE INDEX "idx_availability_schedule_portal_owner" ON "availability_schedule" USING btree ("portal_id","owner_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_rescheduled_from_id_booking_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_availability_schedule_id_availability_schedule_id_fk" FOREIGN KEY ("availability_schedule_id") REFERENCES "public"."availability_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_cancel_token_unique" UNIQUE("cancel_token");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_reschedule_token_unique" UNIQUE("reschedule_token");--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_kind_check" CHECK ("meeting_type"."kind" IN ('solo', 'group'));--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_pooling_check" CHECK ("meeting_type"."pooling_type" IS NULL OR "meeting_type"."pooling_type" = 'collective');--> statement-breakpoint
ALTER TABLE "meeting_type" ADD CONSTRAINT "meeting_type_booking_window_check" CHECK ("meeting_type"."booking_window_type" IN ('rolling', 'range', 'unlimited'));
--> statement-breakpoint

-- ==========================================================================
-- SECCIÓN MANUAL — NO regenerar con db:generate (perdería estos cambios)
-- Agregado manualmente por: F1 calendar-scheduling
-- Motivo: Drizzle ORM no genera EXCLUDE constraints ni DML de backfill.
-- ==========================================================================

-- 1. Extensión requerida para EXCLUDE USING gist sobre columnas text (owner_id).
--    btree_gist permite usar operadores B-tree (=) junto con operadores GiST (&&).
--    Sin esta extensión, PG rechaza el EXCLUDE porque text usa = (B-tree) no GiST nativo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Constraint anti-double-booking por owner.
--    Garantiza a nivel DB (atómico) que no existan dos bookings confirmados
--    del mismo owner que se solapen en el tiempo.
--    Usa tstzrange (timestamp WITH time zone range) con operador && (overlaps).
--    NOTA: las columnas starts_at/ends_at son timestamptz → se usa tstzrange, NO tsrange.
--    tsrange es para timestamp WITHOUT time zone; usarlo con timestamptz causa error 42883.
--    El WHERE parcial excluye bookings cancelados/rescheduled — no bloquean slots.
--    El constraint se dispara con PG error code 23P01 (exclusion_violation)
--    que el service captura y convierte en HTTP 409.
ALTER TABLE "booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    owner_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'confirmed');

-- 3. Backfill bufferMin → bufferAfterMin.
--    Para todas las filas existentes donde buffer_after_min es 0 y buffer_min > 0,
--    copiamos el valor legacy al nuevo campo.
--    Idempotente: el WHERE evita pisar valores ya seteados en corridas posteriores.
UPDATE "meeting_type"
SET buffer_after_min = buffer_min
WHERE buffer_after_min = 0 AND buffer_min > 0;

-- 4. Backfill idempotente: availability_rule → availability_schedule + availability_interval.
--    Por cada owner DISTINCT que tenga reglas, crea un schedule "Default" (si no existe)
--    y migra las reglas como availability_interval.
--    availability_rule y availability_block NO se borran aquí (deprecación gradual).
--    Se eliminan en una PR futura una vez que el service deje de usarlas.

-- 4a. Crear un schedule "Default" por owner/portal para cada owner con reglas.
--     Usamos el primer portal del owner y el primer timezone encontrado en sus reglas.
--     INSERT ... WHERE NOT EXISTS garantiza idempotencia.
INSERT INTO "availability_schedule" (id, owner_id, portal_id, name, time_zone, is_default)
SELECT
  -- Generamos un id determinístico basado en owner para idempotencia:
  -- usamos md5 pero acortado a 25 chars (compatible con cuid length aprox)
  substring(md5('default-schedule-' || ar.owner_id) from 1 for 25),
  ar.owner_id,
  hu.portal_id,
  'Default',
  MIN(ar.time_zone),   -- tomar el primer timezone encontrado (todos deberían ser iguales)
  true
FROM "availability_rule" ar
JOIN "hub_user" hu ON hu.id = ar.owner_id
WHERE NOT EXISTS (
  SELECT 1 FROM "availability_schedule" s
  WHERE s.owner_id = ar.owner_id AND s.is_default = true
)
GROUP BY ar.owner_id, hu.portal_id;

-- 4b. Migrar cada availability_rule como availability_interval en el schedule Default.
--     INSERT ... WHERE NOT EXISTS garantiza idempotencia.
INSERT INTO "availability_interval" (id, schedule_id, day_of_week, start_time, end_time)
SELECT
  substring(md5('interval-' || ar.id) from 1 for 25),
  s.id,
  ar.day_of_week,
  ar.start_time,
  ar.end_time
FROM "availability_rule" ar
JOIN "availability_schedule" s ON s.owner_id = ar.owner_id AND s.is_default = true
WHERE NOT EXISTS (
  SELECT 1 FROM "availability_interval" ai
  WHERE ai.id = substring(md5('interval-' || ar.id) from 1 for 25)
);