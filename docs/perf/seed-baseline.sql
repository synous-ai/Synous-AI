-- ============================================================================
-- perf/seed-baseline.sql
-- Seed SINTÉTICO a escala — SOLO para medir el baseline de performance (Fase 0).
-- NO es un seed de la app. NO correr en producción.
-- Single-portal (la realidad del CRM): toda la data cuelga del portal existente.
-- Distribuciones variadas (fechas en ~2 años, estados/owners/stages aleatorios,
-- ~5-8% archivados) para que el query planner tome decisiones representativas.
-- ============================================================================

BEGIN;

-- IDs base existentes (introspectados de la DB viva)
-- portal:   cif2iq142k61o6oaqooceeem
-- owners:   l63nuc5e4633i40qcn1bq5f1 / oi7co3x46noecqppt0ezuxpy
-- pipeline: syhj0nxjc3edyxacamwi249x
-- stages:   hkvii3zj83m3n6y5rhvynuou tgd0i6ha2sshyt34mjz4i7fx c8xboipnxstqz130q49wjp3d cln6k20ty2sir3dxrb4bfsj2 rqhw1w2sdiebdg6np28n7dpq

-- Helpers inline:
--   owner aleatorio:  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)]
--   stage aleatorio:  (ARRAY['hkvii3zj83m3n6y5rhvynuou','tgd0i6ha2sshyt34mjz4i7fx','c8xboipnxstqz130q49wjp3d','cln6k20ty2sir3dxrb4bfsj2','rqhw1w2sdiebdg6np28n7dpq'])[1+floor(random()*5)]
--   fecha en 2 años:  now() - (random()*730 || ' days')::interval

-- ---------------------------------------------------------------------------
-- COMPANY (2.000)
-- ---------------------------------------------------------------------------
INSERT INTO company (id, portal_id, owner_id, name, domain, industry, created_at, updated_at, archived)
SELECT
  'seedco'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'Company '||g,
  'company'||g||'.test',
  (ARRAY['SaaS','E-commerce','Agency','Fintech','Health','Retail'])[1+floor(random()*6)],
  now() - (random()*730 || ' days')::interval,
  now(),
  (random() < 0.05)
FROM generate_series(1,2000) g;

-- ---------------------------------------------------------------------------
-- CONTACT (20.000) — email único por (portal_id, email)
-- ---------------------------------------------------------------------------
INSERT INTO contact (id, portal_id, owner_id, company_id, first_name, last_name, email, phone, job_title, lifecycle_stage, created_at, updated_at, archived)
SELECT
  'seedct'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  CASE WHEN random() < 0.7 THEN 'seedco'||(1+floor(random()*2000)) ELSE NULL END,
  'First'||g, 'Last'||g,
  ('seedct'||g||'@seed.test')::citext,
  '+1555'||lpad(g::text,7,'0'),
  (ARRAY['CEO','CTO','Manager','Founder','Marketing'])[1+floor(random()*5)],
  (ARRAY['lead','lead','lead','customer','opportunity'])[1+floor(random()*5)],
  now() - (random()*730 || ' days')::interval,
  now(),
  (random() < 0.05)
FROM generate_series(1,20000) g;

-- custom->>'source' para reports (conversion by source): poblar en ~80%
UPDATE contact
SET custom = jsonb_build_object('source', (ARRAY['Referral','Google','LinkedIn','Cold','Event'])[1+floor(random()*5)])
WHERE id LIKE 'seedct%' AND random() < 0.8;

-- ---------------------------------------------------------------------------
-- DEAL (8.000)
-- ---------------------------------------------------------------------------
INSERT INTO deal (id, portal_id, owner_id, pipeline_id, stage_id, primary_contact_id, company_id, name, amount, currency, close_date, created_at, updated_at, archived)
SELECT
  'seedd'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'syhj0nxjc3edyxacamwi249x',
  (ARRAY['hkvii3zj83m3n6y5rhvynuou','tgd0i6ha2sshyt34mjz4i7fx','c8xboipnxstqz130q49wjp3d','cln6k20ty2sir3dxrb4bfsj2','rqhw1w2sdiebdg6np28n7dpq'])[1+floor(random()*5)],
  'seedct'||(1+floor(random()*20000)),
  'seedco'||(1+floor(random()*2000)),
  'Deal '||g,
  (1000 + floor(random()*49000))::numeric,
  (ARRAY['USD','USD','USD','ARS'])[1+floor(random()*4)],
  (now() + (random()*90 || ' days')::interval)::date,
  now() - (random()*730 || ' days')::interval,
  now(),
  (random() < 0.08)
FROM generate_series(1,8000) g;

-- ---------------------------------------------------------------------------
-- DEAL_CONTACT (~12.000) — PK (deal_id, contact_id)
-- ---------------------------------------------------------------------------
INSERT INTO deal_contact (deal_id, contact_id, role, created_at)
SELECT 'seedd'||g, 'seedct'||(1+(g % 20000)), 'primary', now()
FROM generate_series(1,8000) g
ON CONFLICT DO NOTHING;
INSERT INTO deal_contact (deal_id, contact_id, role, created_at)
SELECT 'seedd'||g, 'seedct'||(1+((g+7000) % 20000)), 'stakeholder', now()
FROM generate_series(1,4000) g
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOTE (40.000)
-- ---------------------------------------------------------------------------
INSERT INTO note (id, portal_id, created_by, body, deal_id, contact_id, created_at)
SELECT
  'seedn'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'Note body '||g||' lorem ipsum dolor sit amet',
  'seedd'||(1+floor(random()*8000)),
  CASE WHEN random()<0.5 THEN 'seedct'||(1+floor(random()*20000)) ELSE NULL END,
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,40000) g;

-- ---------------------------------------------------------------------------
-- TASK (30.000)
-- ---------------------------------------------------------------------------
INSERT INTO task (id, portal_id, created_by, assigned_to, title, body, status, priority, due_date, completed_at, deal_id, contact_id, created_at)
SELECT
  'seedt'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'Task '||g,
  'Task body '||g,
  (ARRAY['pending','pending','completed','in_progress','blocked'])[1+floor(random()*5)],
  (ARRAY['low','medium','high'])[1+floor(random()*3)],
  now() + ((random()*60-30) || ' days')::interval,
  CASE WHEN random()<0.3 THEN now() - (random()*100 || ' days')::interval ELSE NULL END,
  'seedd'||(1+floor(random()*8000)),
  CASE WHEN random()<0.4 THEN 'seedct'||(1+floor(random()*20000)) ELSE NULL END,
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,30000) g;

-- ---------------------------------------------------------------------------
-- CALL (25.000)
-- ---------------------------------------------------------------------------
INSERT INTO call (id, portal_id, created_by, title, body, direction, duration_sec, occurred_at, deal_id, contact_id, created_at)
SELECT
  'seedcl'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'Call '||g, 'Call notes '||g,
  (ARRAY['inbound','outbound'])[1+floor(random()*2)],
  floor(random()*1800)::int,
  now() - (random()*730 || ' days')::interval,
  'seedd'||(1+floor(random()*8000)),
  'seedct'||(1+floor(random()*20000)),
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,25000) g;

-- ---------------------------------------------------------------------------
-- MEETING (15.000)
-- ---------------------------------------------------------------------------
INSERT INTO meeting (id, portal_id, created_by, title, starts_at, ends_at, location, deal_id, contact_id, created_at)
SELECT
  'seedm'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'Meeting '||g,
  now() - (random()*730 || ' days')::interval,
  now() - (random()*730 || ' days')::interval,
  (ARRAY['Zoom','Office','Google Meet'])[1+floor(random()*3)],
  'seedd'||(1+floor(random()*8000)),
  'seedct'||(1+floor(random()*20000)),
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,15000) g;

-- ---------------------------------------------------------------------------
-- RECORD_HISTORY (150.000) — la tabla más grande, referencia polimórfica
-- ---------------------------------------------------------------------------
INSERT INTO record_history (id, portal_id, entity_type, entity_id, field_name, old_value, new_value, changed_by, changed_at)
SELECT
  'seedrh'||g,
  'cif2iq142k61o6oaqooceeem',
  t.etype,
  CASE t.etype
    WHEN 'deal' THEN 'seedd'||(1+floor(random()*8000))
    WHEN 'contact' THEN 'seedct'||(1+floor(random()*20000))
    ELSE 'seedco'||(1+floor(random()*2000))
  END,
  (ARRAY['stage_id','amount','lifecycle_stage','owner_id','name'])[1+floor(random()*5)],
  'old'||floor(random()*100),
  'new'||floor(random()*100),
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,150000) g
CROSS JOIN LATERAL (SELECT (ARRAY['deal','contact','company'])[1+floor(random()*3)] AS etype) t;

-- ---------------------------------------------------------------------------
-- EMAIL_SEND (20.000) + EMAIL_EVENT (~50.000)
-- ---------------------------------------------------------------------------
INSERT INTO email_send (id, portal_id, contact_id, deal_id, from_email, to_email, subject, body_html, sent_at)
SELECT
  'seedes'||g,
  'cif2iq142k61o6oaqooceeem',
  'seedct'||(1+floor(random()*20000)),
  'seedd'||(1+floor(random()*8000)),
  ('from@seed.test')::citext,
  ('seedct'||(1+floor(random()*20000))||'@seed.test')::citext,
  'Subject '||g,
  '<p>Email body '||g||'</p>',
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,20000) g;

INSERT INTO email_event (id, email_id, type, occurred_at)
SELECT
  'seedev'||g,
  'seedes'||(1+floor(random()*20000)),
  (ARRAY['opened','opened','clicked','bounced'])[1+floor(random()*4)],
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,50000) g;

-- ---------------------------------------------------------------------------
-- NOTIFICATION (30.000)
-- ---------------------------------------------------------------------------
INSERT INTO notification (id, portal_id, user_id, entity_type, entity_id, type, title, body, read_at, created_at)
SELECT
  'seednt'||g,
  'cif2iq142k61o6oaqooceeem',
  (ARRAY['l63nuc5e4633i40qcn1bq5f1','oi7co3x46noecqppt0ezuxpy'])[1+floor(random()*2)],
  'deal',
  'seedd'||(1+floor(random()*8000)),
  (ARRAY['task_due','deal_stale','proposal_viewed','stage_changed'])[1+floor(random()*4)],
  'Notification '||g,
  'Body '||g,
  CASE WHEN random()<0.6 THEN now() - (random()*100 || ' days')::interval ELSE NULL END,
  now() - (random()*730 || ' days')::interval
FROM generate_series(1,30000) g;

-- ---------------------------------------------------------------------------
-- INVOICE (6.000) — distribución de estados realista
-- ---------------------------------------------------------------------------
INSERT INTO invoice (id, portal_id, number, deal_id, company_id, status, issue_date, due_date, subtotal, tax, total, currency, exchange_rate, amount_base, created_at, updated_at, archived)
SELECT
  'seedinv'||g,
  'cif2iq142k61o6oaqooceeem',
  g,
  'seedd'||(1+floor(random()*8000)),
  'seedco'||(1+floor(random()*2000)),
  (ARRAY['draft','sent','sent','paid','paid','overdue','void'])[1+floor(random()*7)],
  (now() - (random()*730 || ' days')::interval)::date,
  (now() - (random()*700 || ' days')::interval)::date,
  amt, amt*0.21, amt*1.21,
  cur,
  CASE WHEN cur='ARS' THEN 1000 ELSE 1 END,
  CASE WHEN cur='ARS' THEN (amt*1.21)/1000 ELSE amt*1.21 END,
  now() - (random()*730 || ' days')::interval,
  now(),
  (random() < 0.03)
FROM generate_series(1,6000) g
CROSS JOIN LATERAL (SELECT (500+floor(random()*20000))::numeric AS amt, (ARRAY['USD','USD','ARS'])[1+floor(random()*3)] AS cur) v;

-- ---------------------------------------------------------------------------
-- PAYMENT (12.000) — sobre facturas existentes
-- ---------------------------------------------------------------------------
INSERT INTO payment (id, portal_id, invoice_id, amount, method, paid_at, currency, exchange_rate, amount_base, created_at)
SELECT
  'seedpay'||g,
  'cif2iq142k61o6oaqooceeem',
  'seedinv'||(1+floor(random()*6000)),
  amt, (ARRAY['transfer','card','cash'])[1+floor(random()*3)],
  now() - (random()*700 || ' days')::interval,
  cur,
  CASE WHEN cur='ARS' THEN 1000 ELSE 1 END,
  CASE WHEN cur='ARS' THEN amt/1000 ELSE amt END,
  now()
FROM generate_series(1,12000) g
CROSS JOIN LATERAL (SELECT (200+floor(random()*10000))::numeric AS amt, (ARRAY['USD','USD','ARS'])[1+floor(random()*3)] AS cur) v;

-- ---------------------------------------------------------------------------
-- EXPENSE (5.000)
-- ---------------------------------------------------------------------------
INSERT INTO expense (id, portal_id, description, amount, currency, exchange_rate, amount_base, category, expense_date, created_at, updated_at, archived)
SELECT
  'seedexp'||g,
  'cif2iq142k61o6oaqooceeem',
  'Expense '||g,
  amt, cur,
  CASE WHEN cur='ARS' THEN 1000 ELSE 1 END,
  CASE WHEN cur='ARS' THEN amt/1000 ELSE amt END,
  (ARRAY['software','infraestructura','equipo','impuestos','oficina','marketing','otros'])[1+floor(random()*7)],
  (now() - (random()*730 || ' days')::interval)::date,
  now() - (random()*730 || ' days')::interval,
  now(),
  (random() < 0.03)
FROM generate_series(1,5000) g
CROSS JOIN LATERAL (SELECT (100+floor(random()*5000))::numeric AS amt, (ARRAY['USD','ARS'])[1+floor(random()*2)] AS cur) v;

COMMIT;

-- Refrescar estadísticas del planner — CRÍTICO para que EXPLAIN sea representativo
ANALYZE;
