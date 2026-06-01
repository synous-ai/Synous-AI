import { pgTable, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const deliverable = pgTable('deliverable', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  dealId: text('deal_id').notNull().references(() => deal.id),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  url: text('url'),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('pending_review'),
  feedback: text('feedback'),
  reviewedBy: text('reviewed_by').references(() => clientAccount.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('deliverable_type_check', sql`${table.type} IN ('design','prototype','staging','final')`),
  check('deliverable_status_check', sql`${table.status} IN ('pending_review','approved','changes_requested')`),
  index('idx_deliverable_deal').on(table.dealId),
])
