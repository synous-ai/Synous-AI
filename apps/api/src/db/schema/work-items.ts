import { pgTable, text, boolean, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { deal } from './deals'
import { createId } from '../../lib/id'

export const workItem = pgTable('work_item', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('medium'),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),
  assignedTo: text('assigned_to').references(() => hubUser.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'work_item_type_check',
    sql`${table.type} IN ('bug','improvement','roadmap','process')`,
  ),
  check(
    'work_item_status_check',
    sql`${table.status} IN ('open','in_progress','done','cancelled')`,
  ),
  check(
    'work_item_priority_check',
    sql`${table.priority} IN ('low','medium','high')`,
  ),
  index('idx_work_item_portal_type').on(table.portalId, table.type),
])
