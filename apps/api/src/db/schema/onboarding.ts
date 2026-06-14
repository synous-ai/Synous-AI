import { pgTable, text, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { contact } from './contacts'
import { deal } from './deals'
import { createId } from '../../lib/id'

/**
 * Submission del wizard de onboarding PRE-venta (filtro de ventas).
 * Lo llena un prospecto vía link público, antes de ser cliente.
 * Cada submission crea automáticamente un contact (lead) + un deal.
 */
export const onboardingSubmission = pgTable('onboarding_submission', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),

  // ── Denormalizado para listado rápido en el admin ──
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  company: text('company'),

  // ── Respuestas completas del wizard ──
  answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),

  // ── Routing de ventas: budget > 2000 || claridad baja → call ──
  decision: text('decision').notNull(),

  // ── CRM creado automáticamente ──
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('onboarding_submission_decision_check', sql`${table.decision} IN ('call','proposal')`),
  index('idx_onboarding_submission_portal').on(table.portalId),
])
