import { pgTable, text, boolean, numeric, char, date, jsonb, timestamp, index, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { pipeline, pipelineStage } from './pipelines'
import { contact } from './contacts'
import { company } from './companies'
import { createId } from '../../lib/id'

export const deal = pgTable('deal', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => hubUser.id, { onDelete: 'set null' }),
  pipelineId: text('pipeline_id').notNull().references(() => pipeline.id),
  stageId: text('stage_id').notNull().references(() => pipelineStage.id),
  primaryContactId: text('primary_contact_id').references(() => contact.id, { onDelete: 'set null' }),
  companyId: text('company_id').references(() => company.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  closeDate: date('close_date'),
  custom: jsonb('custom').notNull().default({}),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Compuesto para el listado paginado (WHERE portal AND archived=false ORDER BY created_at DESC, id DESC).
  // portal_id sigue de columna líder, así que también sirve los filtros por portal.
  index('idx_deal_portal_created').on(table.portalId, table.createdAt, table.id).where(sql`archived = false`),
  index('idx_deal_pipeline').on(table.pipelineId, table.stageId),
  index('idx_deal_owner').on(table.ownerId),
  index('idx_deal_contact').on(table.primaryContactId),
  index('idx_deal_company').on(table.companyId),
])

export const dealContact = pgTable('deal_contact', {
  dealId: text('deal_id').notNull().references(() => deal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  role: text('role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.dealId, table.contactId] }),
  index('idx_deal_contact_contact').on(table.contactId),
])
