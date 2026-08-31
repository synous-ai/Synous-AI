import { pgTable, text, integer, jsonb, timestamp, unique, check, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { createId } from '../../lib/id'

/**
 * Onboarding POST-VENTA (post-pago): wizard de 8 pasos que el cliente completa
 * autenticado dentro del Client Portal, una vez que el deal ya se ganó.
 *
 * Reemplaza al wizard pre-venta (`onboarding_submission`, ver onboarding.ts),
 * que sigue viva únicamente como dato histórico — este es un módulo distinto.
 *
 * 1 fila por deal (UNIQUE deal_id): el onboarding post-venta es 1:1 con el
 * proyecto que arranca. `steps_completed` es un mapa { "1": ISOtimestamp, ...,
 * "8": ISOtimestamp } que usa el wizard para saber qué pasos ya se marcaron.
 *
 * Parte 1 — orientación (pasos 1-4, se marcan vía PATCH /progress):
 *   1 Bienvenida (video) · 2 Cómo funciona · 3 Roadmap de 9 fases · 4 Modo de trabajo
 * Parte 2 — acción (pasos 5-8, cada uno con su propio endpoint):
 *   5 Firma · 6 Brief (16 preguntas) · 7 Materiales (upload) · 8 Confirmación (gate)
 */
export const clientOnboarding = pgTable('client_onboarding', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  dealId: text('deal_id').notNull().references(() => deal.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clientAccount.id, { onDelete: 'cascade' }),

  status: text('status').notNull().default('in_progress'),
  currentStep: integer('current_step').notNull().default(1),
  /** Mapa { "1": ISOtimestamp, ..., "8": ISOtimestamp } de pasos completados. */
  stepsCompleted: jsonb('steps_completed').$type<Record<string, string>>().notNull().default({}),

  // ── Paso 5 — Firma. Checkbox de aceptación + nombre tipeado + timestamp + IP.
  // NO DocuSeal (decisión de negocio explícita).
  signatureName: text('signature_name'),
  signatureAcceptedAt: timestamp('signature_accepted_at', { withTimezone: true }),
  signatureIp: text('signature_ip'),

  // ── Paso 6 — Brief del proyecto (16 preguntas, ver OnboardingBriefSchema).
  briefAnswers: jsonb('brief_answers').$type<Record<string, unknown> | null>(),

  // ── Paso 7 — Materiales. Estado por categoría fija (logoBrand, programContent,
  // clientBase, toolAccess) + IDs de client_asset vinculados por cada una.
  materials: jsonb('materials').$type<Record<string, unknown>>().notNull().default({}),

  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('client_onboarding_deal_id_unique').on(table.dealId),
  check('client_onboarding_status_check', sql`${table.status} IN ('in_progress','completed')`),
  // listOnboardings (admin) filtra por portal_id y ordena por status/updated_at.
  index('idx_client_onboarding_portal_status').on(table.portalId, table.status),
])
