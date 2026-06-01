import { pgTable, text, jsonb, timestamp, primaryKey, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { createId } from '../../lib/id'

export const crmList = pgTable('crm_list', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  name: text('name').notNull(),
  processingType: text('processing_type').notNull().default('MANUAL'),
  filterBranch: jsonb('filter_branch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('crm_list_entity_type_check', sql`${table.entityType} IN ('contact','company','deal')`),
  check('crm_list_processing_type_check', sql`${table.processingType} IN ('MANUAL','DYNAMIC')`),
])

export const listMembership = pgTable('list_membership', {
  listId: text('list_id').notNull().references(() => crmList.id, { onDelete: 'cascade' }),
  // entityId is a polymorphic reference (not a declared FK) — kept as text (CUID2)
  entityId: text('entity_id').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.listId, table.entityId] }),
])
