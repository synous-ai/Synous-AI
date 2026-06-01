import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const recordHistory = pgTable('record_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fieldName: text('field_name').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  changedBy: text('changed_by').references(() => hubUser.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_record_history_entity').on(table.entityType, table.entityId, table.fieldName, table.changedAt),
])
