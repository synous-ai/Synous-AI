import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { hubUser } from './users'
import { clientAccount } from './client-portal'
import { createId } from '../../lib/id'

export const notification = pgTable('notification', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  userId: text('user_id').references(() => hubUser.id),
  clientId: text('client_id').references(() => clientAccount.id),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  actionUrl: text('action_url'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notification_user').on(table.userId, table.readAt),
  index('idx_notification_client').on(table.clientId, table.readAt),
])
