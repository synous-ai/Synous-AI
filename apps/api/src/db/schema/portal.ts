import { pgTable, text, char, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '../../lib/id'

export const portal = pgTable('portal', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  domain: text('domain'),
  timeZone: text('time_zone').notNull().default('America/Bogota'),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
