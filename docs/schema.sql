-- =============================================================
-- DevDúo CRM — Schema PostgreSQL (modelo TIPADO, sin EAV)
-- =============================================================
-- Reemplaza el modelo unificado crm_object/property por tablas
-- tipadas reales (contact, company, deal, actividades). Drizzle
-- recupera type-safety end-to-end y PostgreSQL recupera integridad
-- referencial, NOT NULL reales y queries simples para reportes.
--
-- Cada tabla núcleo conserva una columna `custom jsonb` como válvula
-- de escape para campos ad-hoc poco frecuentes, SIN reconstruir el
-- registro dinámico de propiedades de HubSpot.
--
-- Multi-tenancy: se conserva portal_id en todas las tablas.
-- Requiere PostgreSQL 16+. Ejecutar en orden.
-- =============================================================


-- =============================================================
-- 0. EXTENSIONES Y HELPERS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- búsqueda fuzzy por texto
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;        -- emails case-insensitive
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- EXCLUDE de solapamiento en bookings

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- 1. PORTAL (multi-tenancy)
-- =============================================================
CREATE TABLE portal (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  domain     text,
  time_zone  text NOT NULL DEFAULT 'America/Bogota',
  currency   char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================
-- 2. EQUIPO INTERNO (hub_user)
-- =============================================================
-- Se elimina la tabla `owner` separada: en una agencia los owners
-- SON los usuarios. owner_id en el resto del schema referencia
-- directamente a hub_user. Si en el futuro un owner pudiera no ser
-- usuario (raro), se agrega entonces — no antes.
CREATE TABLE hub_user (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id     bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  first_name    text,
  last_name     text,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','member','viewer')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, email)
);


-- =============================================================
-- 3. PIPELINES Y ETAPAS (para deals)
-- =============================================================
CREATE TABLE pipeline (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id     bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  label         text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_stage (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pipeline_id   bigint NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  label         text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  probability   numeric(5,4) CHECK (probability BETWEEN 0 AND 1),
  is_closed     boolean NOT NULL DEFAULT false,
  is_won        boolean NOT NULL DEFAULT false,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stage_pipeline ON pipeline_stage (pipeline_id, display_order);


-- =============================================================
-- 4. COMPANY (empresa cliente)
-- =============================================================
CREATE TABLE company (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  owner_id    bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  name        text NOT NULL,
  domain      text,                 -- ej: cliente.com
  industry    text,
  phone       text,
  website     text,
  custom      jsonb NOT NULL DEFAULT '{}',  -- campos ad-hoc poco frecuentes
  archived    boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_portal ON company (portal_id) WHERE archived = false;
CREATE INDEX idx_company_owner  ON company (owner_id);
CREATE INDEX idx_company_name_trgm ON company USING gin (name gin_trgm_ops);


-- =============================================================
-- 5. CONTACT (persona)
-- =============================================================
CREATE TABLE contact (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id       bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  owner_id        bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  company_id      bigint REFERENCES company(id) ON DELETE SET NULL, -- empresa principal
  first_name      text,
  last_name       text,
  email           citext,
  phone           text,
  job_title       text,
  lifecycle_stage text NOT NULL DEFAULT 'lead'
                  CHECK (lifecycle_stage IN ('lead','mql','sql','opportunity','customer','other')),
  custom          jsonb NOT NULL DEFAULT '{}',
  archived        boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- email único por portal cuando existe (NULLs no colisionan)
  UNIQUE (portal_id, email)
);
CREATE INDEX idx_contact_portal  ON contact (portal_id) WHERE archived = false;
CREATE INDEX idx_contact_company ON contact (company_id);
CREATE INDEX idx_contact_owner   ON contact (owner_id);
CREATE INDEX idx_contact_email   ON contact (email);


-- =============================================================
-- 6. DEAL (negocio / proyecto)
-- =============================================================
CREATE TABLE deal (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id          bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  owner_id           bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  pipeline_id        bigint NOT NULL REFERENCES pipeline(id),
  stage_id           bigint NOT NULL REFERENCES pipeline_stage(id),
  primary_contact_id bigint REFERENCES contact(id) ON DELETE SET NULL,
  company_id         bigint REFERENCES company(id) ON DELETE SET NULL,
  name               text NOT NULL,
  amount             numeric(12,2),          -- tipado: forecast sale de aquí, no de un JSONB
  currency           char(3) NOT NULL DEFAULT 'USD',
  close_date         date,
  custom             jsonb NOT NULL DEFAULT '{}',
  archived           boolean NOT NULL DEFAULT false,
  archived_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_portal   ON deal (portal_id) WHERE archived = false;
CREATE INDEX idx_deal_pipeline ON deal (pipeline_id, stage_id);
CREATE INDEX idx_deal_owner    ON deal (owner_id);
CREATE INDEX idx_deal_contact  ON deal (primary_contact_id);
CREATE INDEX idx_deal_company  ON deal (company_id);


-- =============================================================
-- 7. ASOCIACIÓN deal ↔ contacts (un deal puede tener varios contactos)
-- =============================================================
-- Las asociaciones genéricas N:M del EAV se reemplazan por joins
-- explícitos donde el negocio los necesita de verdad. El contacto/empresa
-- principal vive como FK directa en deal; aquí van los contactos extra.
CREATE TABLE deal_contact (
  deal_id    bigint NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  contact_id bigint NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  role       text,   -- ej: 'decision_maker' | 'billing' | 'technical'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, contact_id)
);
CREATE INDEX idx_deal_contact_contact ON deal_contact (contact_id);


-- =============================================================
-- 8. CALENDARIO NATIVO
-- =============================================================
-- (Definido antes de las actividades porque meeting referencia booking.)
CREATE TABLE availability_rule (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    bigint NOT NULL REFERENCES hub_user(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  time_zone   text NOT NULL DEFAULT 'America/Bogota',
  CHECK (end_time > start_time)
);

CREATE TABLE availability_block (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id  bigint NOT NULL REFERENCES hub_user(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  reason    text,
  CHECK (ends_at > starts_at)
);

CREATE TABLE meeting_type (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id    bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  owner_id     bigint NOT NULL REFERENCES hub_user(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  name         text NOT NULL,
  duration_min int NOT NULL CHECK (duration_min > 0),
  buffer_min   int NOT NULL DEFAULT 10,
  location     text,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (portal_id, slug)
);

CREATE TABLE booking (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_type_id bigint NOT NULL REFERENCES meeting_type(id),
  owner_id        bigint NOT NULL REFERENCES hub_user(id),  -- desnormalizado para el EXCLUDE
  contact_id      bigint REFERENCES contact(id) ON DELETE SET NULL,
  deal_id         bigint REFERENCES deal(id) ON DELETE SET NULL,
  guest_name      text NOT NULL,
  guest_email     citext NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','cancelled','rescheduled')),
  meet_link       text,
  notes           text,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- Garantía a nivel DB contra doble booking del mismo owner.
  -- Las canceladas no cuentan. Esto cierra la race condition que
  -- el algoritmo de slots NO puede prevenir bajo concurrencia.
  CONSTRAINT booking_no_overlap EXCLUDE USING gist (
    owner_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX idx_booking_owner_time ON booking (owner_id, starts_at);
CREATE INDEX idx_booking_deal       ON booking (deal_id);


-- =============================================================
-- 9. ACTIVIDADES (notes, tasks, calls, meetings)
-- =============================================================
-- Tablas tipadas en lugar de filas crm_object. Cada actividad puede
-- colgar de un deal, un contact y/o una company (FKs nullables).

CREATE TABLE note (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  created_by  bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  body        text NOT NULL,
  deal_id     bigint REFERENCES deal(id) ON DELETE CASCADE,
  contact_id  bigint REFERENCES contact(id) ON DELETE CASCADE,
  company_id  bigint REFERENCES company(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_deal    ON note (deal_id);
CREATE INDEX idx_note_contact ON note (contact_id);

CREATE TABLE task (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  created_by  bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  assigned_to bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  title       text NOT NULL,
  body        text,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','completed','cancelled')),
  priority    text NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low','medium','high')),
  due_date    timestamptz,
  completed_at timestamptz,
  deal_id     bigint REFERENCES deal(id) ON DELETE CASCADE,
  contact_id  bigint REFERENCES contact(id) ON DELETE CASCADE,
  company_id  bigint REFERENCES company(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_assignee ON task (assigned_to, status);
CREATE INDEX idx_task_due      ON task (due_date) WHERE status <> 'completed';
CREATE INDEX idx_task_deal     ON task (deal_id);

CREATE TABLE call (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id    bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  created_by   bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  title        text,
  body         text,
  direction    text CHECK (direction IN ('inbound','outbound')),
  duration_sec int,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  deal_id      bigint REFERENCES deal(id) ON DELETE CASCADE,
  contact_id   bigint REFERENCES contact(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_deal    ON call (deal_id);
CREATE INDEX idx_call_contact ON call (contact_id);

CREATE TABLE meeting (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id     bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  created_by    bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  booking_id    bigint REFERENCES booking(id) ON DELETE SET NULL,
  title         text NOT NULL,
  starts_at     timestamptz,
  ends_at       timestamptz,
  location      text,
  deal_id       bigint REFERENCES deal(id) ON DELETE CASCADE,
  contact_id    bigint REFERENCES contact(id) ON DELETE CASCADE,
  -- Enriquecimiento Fathom (tipado donde importa, jsonb para lo variable)
  fathom_summary        text,
  fathom_transcript_url text,
  fathom_action_items   jsonb,
  fathom_participants   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_deal    ON meeting (deal_id);
CREATE INDEX idx_meeting_booking ON meeting (booking_id);


-- =============================================================
-- 10. HISTORIAL DE CAMBIOS (polimórfico, tipado en old/new)
-- =============================================================
-- Reemplaza property_history. Como cruza varias tablas, usa referencia
-- polimórfica (entity_type, entity_id) — patrón estándar y aceptable
-- para tablas de auditoría, donde no se ponen FKs duros.
CREATE TABLE record_history (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id     bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,   -- 'contact' | 'company' | 'deal' | ...
  entity_id     bigint NOT NULL,
  field_name    text NOT NULL,
  old_value     text,
  new_value     text,
  source_type   text,            -- API | FORM | IMPORT | AUTOMATION | DOCUSEAL | FATHOM
  source_id     text,
  changed_by    bigint REFERENCES hub_user(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_record_history_entity
  ON record_history (entity_type, entity_id, field_name, changed_at DESC);


-- =============================================================
-- 11. LISTAS (estáticas y dinámicas)
-- =============================================================
CREATE TABLE crm_list (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id       bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  entity_type     text NOT NULL CHECK (entity_type IN ('contact','company','deal')),
  name            text NOT NULL,
  processing_type text NOT NULL DEFAULT 'MANUAL'
                  CHECK (processing_type IN ('MANUAL','DYNAMIC')),
  filter_branch   jsonb,         -- definición del filtro para listas dinámicas
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE list_membership (
  list_id   bigint NOT NULL REFERENCES crm_list(id) ON DELETE CASCADE,
  entity_id bigint NOT NULL,     -- id del contact/company/deal según crm_list.entity_type
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, entity_id)
);


-- =============================================================
-- 12. CLIENT PORTAL — CUENTAS Y ACCESOS
-- =============================================================
CREATE TABLE client_account (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id        bigint NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  contact_id       bigint NOT NULL REFERENCES contact(id),
  email            citext NOT NULL,
  password_hash    text,
  invite_token     text UNIQUE,
  invite_sent_at   timestamptz,
  invite_accepted  boolean NOT NULL DEFAULT false,
  last_login_at    timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, email)
);

CREATE TABLE client_deal_access (
  client_id bigint NOT NULL REFERENCES client_account(id) ON DELETE CASCADE,
  deal_id   bigint NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, deal_id)
);


-- =============================================================
-- 13. FORMULARIOS DE INTAKE (onboarding del proyecto)
-- =============================================================
CREATE TABLE intake_form (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id),
  name        text NOT NULL,
  description text,
  slug        text NOT NULL,
  fields      jsonb NOT NULL DEFAULT '[]',  -- definición del formulario (estructura variable: jsonb correcto)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, slug)
);

CREATE TABLE deal_intake (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deal_id      bigint NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  form_id      bigint NOT NULL REFERENCES intake_form(id),
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','in_progress','completed')),
  due_date     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_intake_deal ON deal_intake (deal_id);

CREATE TABLE deal_intake_response (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intake_id    bigint NOT NULL REFERENCES deal_intake(id) ON DELETE CASCADE,
  client_id    bigint NOT NULL REFERENCES client_account(id),
  answers      jsonb NOT NULL DEFAULT '{}',  -- respuestas (estructura variable: jsonb correcto)
  submitted_at timestamptz NOT NULL DEFAULT now(),
  -- Una respuesta por intake (upsert). Si querés historial de envíos,
  -- quitá este UNIQUE y versioná en su lugar.
  UNIQUE (intake_id)
);

CREATE TABLE client_asset (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id    bigint NOT NULL REFERENCES portal(id),
  deal_id      bigint NOT NULL REFERENCES deal(id),
  client_id    bigint NOT NULL REFERENCES client_account(id),
  intake_id    bigint REFERENCES deal_intake(id),
  field_name   text,
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('logo','foto','documento','acceso','otro')),
  mime_type    text,
  storage_key  text NOT NULL,   -- clave en R2/S3 (NUNCA guardar URL, expira)
  size_bytes   bigint,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_asset_deal ON client_asset (deal_id);


-- =============================================================
-- 14. ENTREGABLES
-- =============================================================
CREATE TABLE deliverable (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deal_id      bigint NOT NULL REFERENCES deal(id),
  title        text NOT NULL,
  description  text,
  type         text NOT NULL CHECK (type IN ('design','prototype','staging','final')),
  url          text,
  version      int NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'pending_review'
               CHECK (status IN ('pending_review','approved','changes_requested')),
  feedback     text,
  reviewed_by  bigint REFERENCES client_account(id),
  reviewed_at  timestamptz,
  created_by   bigint REFERENCES hub_user(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliverable_deal ON deliverable (deal_id);


-- =============================================================
-- 15. CHANGE REQUESTS (control de alcance)
-- =============================================================
CREATE TABLE change_request (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id            bigint NOT NULL REFERENCES portal(id),
  deal_id              bigint NOT NULL REFERENCES deal(id),
  number               int NOT NULL,   -- CR#1, CR#2... relativo al deal
  title                text NOT NULL,
  description          text NOT NULL,
  original_scope_ref   text,
  origin               text NOT NULL DEFAULT 'client'
                       CHECK (origin IN ('client','agency')),
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','sent','approved','rejected',
                                         'negotiating','approved_verbally','disputed','completed')),
  version              int NOT NULL DEFAULT 1,
  total_amount         numeric(12,2),
  timeline_impact_days int NOT NULL DEFAULT 0,
  new_delivery_date    date,
  approved_at          timestamptz,
  approved_by          bigint REFERENCES client_account(id),
  completed_at         timestamptz,
  created_by           bigint REFERENCES hub_user(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, number)
);
CREATE INDEX idx_cr_deal ON change_request (deal_id, status);

CREATE TABLE change_request_item (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id bigint NOT NULL REFERENCES change_request(id) ON DELETE CASCADE,
  description       text NOT NULL,
  hours             numeric(6,2),
  unit_price        numeric(12,2) NOT NULL,
  quantity          numeric(8,2) NOT NULL DEFAULT 1,
  subtotal          numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED
);
CREATE INDEX idx_cr_item_cr ON change_request_item (change_request_id);

CREATE TABLE change_request_attachment (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id bigint NOT NULL REFERENCES change_request(id) ON DELETE CASCADE,
  name              text NOT NULL,
  storage_key       text NOT NULL,
  mime_type         text,
  uploaded_by       bigint REFERENCES hub_user(id),
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_request_history (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id bigint NOT NULL REFERENCES change_request(id) ON DELETE CASCADE,
  from_status       text,
  to_status         text NOT NULL,
  comment           text,
  changed_by_user   bigint REFERENCES hub_user(id),
  changed_by_client bigint REFERENCES client_account(id),
  changed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_request_comment (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id bigint NOT NULL REFERENCES change_request(id) ON DELETE CASCADE,
  body              text NOT NULL,
  author_user       bigint REFERENCES hub_user(id),
  author_client     bigint REFERENCES client_account(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- exactamente un autor: o user o client, nunca ambos ni ninguno
  CHECK (
    (author_user IS NOT NULL AND author_client IS NULL) OR
    (author_user IS NULL AND author_client IS NOT NULL)
  )
);
CREATE INDEX idx_cr_comment_cr ON change_request_comment (change_request_id, created_at);


-- =============================================================
-- 16. DOCUMENTOS (contratos, propuestas, facturas)
-- =============================================================
CREATE TABLE document (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id              bigint NOT NULL REFERENCES portal(id),
  deal_id                bigint REFERENCES deal(id),
  cr_id                  bigint REFERENCES change_request(id),
  name                   text NOT NULL,
  type                   text NOT NULL CHECK (type IN ('contract','proposal','invoice','other')),
  source                 text CHECK (source IN ('docuseal','manual','generated')),
  -- DocuSeal: guardar submission_id, NUNCA la URL (expira en 40min)
  docuseal_submission_id bigint,
  docuseal_template_id   bigint,
  docuseal_status        text CHECK (docuseal_status IN ('pending','completed','declined','expired')),
  docuseal_external_id   text UNIQUE,
  storage_key            text,    -- para docs generados internamente
  signed_at              timestamptz,
  signed_by              bigint REFERENCES client_account(id),
  created_by             bigint REFERENCES hub_user(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_deal ON document (deal_id);


-- =============================================================
-- 17. EMAIL TRACKING
-- =============================================================
CREATE TABLE email_send (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id),
  contact_id  bigint REFERENCES contact(id) ON DELETE SET NULL,
  deal_id     bigint REFERENCES deal(id) ON DELETE SET NULL,
  from_email  citext NOT NULL,
  to_email    citext NOT NULL,
  subject     text NOT NULL,
  body_html   text,
  tracking_id uuid NOT NULL DEFAULT gen_random_uuid(),
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_send_contact  ON email_send (contact_id);
CREATE INDEX idx_email_send_tracking ON email_send (tracking_id);

CREATE TABLE email_event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_id    bigint NOT NULL REFERENCES email_send(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('opened','clicked','bounced','unsubscribed')),
  link_url    text,
  user_agent  text,
  ip_address  inet,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_event_email ON email_event (email_id, type);


-- =============================================================
-- 18. NOTIFICACIONES
-- =============================================================
CREATE TABLE notification (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id),
  user_id     bigint REFERENCES hub_user(id),
  client_id   bigint REFERENCES client_account(id),
  entity_type text,            -- referencia polimórfica al registro relacionado
  entity_id   bigint,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  action_url  text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_user   ON notification (user_id, read_at);
CREATE INDEX idx_notification_client ON notification (client_id, read_at);


-- =============================================================
-- 19. AUDIT LOG
-- =============================================================
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id   bigint NOT NULL REFERENCES portal(id),
  user_id     bigint REFERENCES hub_user(id),
  client_id   bigint REFERENCES client_account(id),
  entity_type text,            -- referencia polimórfica
  entity_id   bigint,
  action      text NOT NULL,   -- CREATE | UPDATE | DELETE | STAGE_CHANGE | LOGIN
  payload     jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);


-- =============================================================
-- 20. TRIGGERS updated_at (esto faltaba por completo en el doc original)
-- =============================================================
CREATE TRIGGER trg_portal_updated         BEFORE UPDATE ON portal         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hub_user_updated       BEFORE UPDATE ON hub_user       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pipeline_updated       BEFORE UPDATE ON pipeline       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_company_updated        BEFORE UPDATE ON company        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contact_updated        BEFORE UPDATE ON contact        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deal_updated           BEFORE UPDATE ON deal           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_crm_list_updated       BEFORE UPDATE ON crm_list       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_change_request_updated BEFORE UPDATE ON change_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();
