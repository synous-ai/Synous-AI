import { pgTable, text, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const notificationPref = pgTable(
  'notification_pref',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    portalId: text('portal_id')
      .notNull()
      .references(() => portal.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => hubUser.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notification_pref_user_id_event_type_unique').on(table.userId, table.eventType),
    index('idx_notification_pref_portal_user').on(table.portalId, table.userId),
  ],
)
