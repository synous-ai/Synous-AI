import { pgTable, text, jsonb, numeric, char, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { contact } from './contacts'
import { onboardingSubmission } from './onboarding'
import { createId } from '../../lib/id'
import type { ProposalContent } from '../../modules/proposals/proposals.types'

/**
 * Propuestas comerciales generadas por IA a partir del onboarding.
 *
 * Flujo: el admin la genera (status `draft`) → la revisa/edita → la acepta
 * (`accepted`) → se la envía al prospecto vía link público `/p/<token>`
 * (`sent` → `viewed` cuando la abre). El contenido vive en `content` (jsonb
 * tipado) y es editable hasta aceptarse.
 *
 * `token` es la credencial pública del link (cuid2, inadivinable): cualquiera
 * con el link ve la propuesta, sin login. Por eso NO se exponen datos sensibles
 * en `content`, solo lo que se le muestra al cliente.
 */
export const proposal = pgTable(
  'proposal',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    portalId: text('portal_id')
      .notNull()
      .references(() => portal.id, { onDelete: 'cascade' }),
    // Deal/contacto que origina la propuesta (set null si se archivan).
    dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),
    contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    // Submission del onboarding que alimentó la generación (trazabilidad).
    onboardingSubmissionId: text('onboarding_submission_id').references(() => onboardingSubmission.id, {
      onDelete: 'set null',
    }),
    // Credencial pública del link `/p/<token>`. Inadivinable.
    token: text('token')
      .notNull()
      .$defaultFn(() => createId()),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    content: jsonb('content').$type<ProposalContent>().notNull(),
    // Provider de IA que la generó (gemini | claude | manual).
    model: text('model'),
    // Total denormalizado para listados rápidos.
    amount: numeric('amount', { precision: 12, scale: 2 }),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    // Primera vez que el cliente llegó al ÚLTIMO paso de la presentación.
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('proposal_status_check', sql`${table.status} IN ('draft','accepted','sent','viewed')`),
    index('idx_proposal_portal').on(table.portalId),
    index('idx_proposal_token').on(table.token),
    index('idx_proposal_deal').on(table.dealId),
  ],
)
