import { pgTable, text, integer, timestamp, index, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { changeRequest } from './change-requests'
import { clientAccount } from './client-portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const document = pgTable('document', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').references(() => deal.id),
  crId: text('cr_id').references(() => changeRequest.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  source: text('source'),
  // docuseal IDs are external numeric IDs — kept as integer (not FKs)
  docusealSubmissionId: integer('docuseal_submission_id'),
  docusealTemplateId: integer('docuseal_template_id'),
  docusealStatus: text('docuseal_status'),
  docusealExternalId: text('docuseal_external_id').unique(),
  storageKey: text('storage_key'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedBy: text('signed_by').references(() => clientAccount.id),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('document_type_check', sql`${table.type} IN ('contract','proposal','invoice','other')`),
  check('document_source_check', sql`${table.source} IN ('docuseal','manual','generated')`),
  check('document_docuseal_status_check', sql`${table.docusealStatus} IN ('pending','completed','declined','expired')`),
  index('idx_document_deal').on(table.dealId),
])
