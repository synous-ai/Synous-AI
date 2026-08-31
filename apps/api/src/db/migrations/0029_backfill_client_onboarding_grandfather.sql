-- Custom SQL migration file, put your code below! --

-- ==========================================================================
-- Backfill: grandfathere accesos existentes al portal como onboarding
-- 'completed'.
-- Motivo: el gate del wizard (useOnboardingGate en
-- app/portal/(app)/page.tsx) reemplaza TODO el portal por el wizard de 8
-- pasos para cualquier client_onboarding con status != 'completed'. Como
-- GET /api/client/onboarding lazy-crea la fila en 'in_progress' si no existe,
-- un cliente activo PRE-deploy de este feature (deal ganado hace semanas, ya
-- usando entregables/facturas normalmente) quedaría bloqueado por el wizard
-- en su próximo login.
--
-- Idempotente: ON CONFLICT (deal_id) DO NOTHING — deal_id es UNIQUE en
-- client_onboarding, así que correr esto de nuevo (o contra una fila que el
-- propio cliente ya generó completando el wizard real) no pisa nada.
--
-- Alcance: solo accesos a deals NO archivados — un client_deal_access de un
-- deal archivado no es el "deal activo" que resuelve resolveActiveDeal() en
-- onboarding.service.ts, así que no hace falta (ni conviene) grandfatherlo.
INSERT INTO "client_onboarding" (id, portal_id, deal_id, client_id, status, current_step, steps_completed, completed_at)
SELECT
  -- Id determinístico (mismo patrón que 0016_late_deathbird.sql): idempotente
  -- ante corridas repetidas, aunque el ON CONFLICT (deal_id) ya alcanza.
  substring(md5('client-onboarding-backfill-' || cda.deal_id) from 1 for 25),
  d.portal_id,
  cda.deal_id,
  cda.client_id,
  'completed',
  8,
  '{}'::jsonb,
  now()
FROM "client_deal_access" cda
JOIN "deal" d ON d.id = cda.deal_id
WHERE d.archived = false
ON CONFLICT (deal_id) DO NOTHING;
