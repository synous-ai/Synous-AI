import { pgTable, text, boolean, timestamp, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { citext } from './_custom'
import { createId } from '../../lib/id'

export const hubUser = pgTable('hub_user', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  email: citext('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('hub_user_portal_id_email_unique').on(table.portalId, table.email),
  check('hub_user_role_check', sql`${table.role} IN ('owner','member','viewer')`),
])
