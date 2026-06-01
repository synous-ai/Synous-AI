import { pgTable, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const company = pgTable('company', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => hubUser.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  domain: text('domain'),
  industry: text('industry'),
  phone: text('phone'),
  website: text('website'),
  custom: jsonb('custom').notNull().default({}),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_company_portal').on(table.portalId).where(sql`archived = false`),
  index('idx_company_owner').on(table.ownerId),
  // NOTE: idx_company_name_trgm uses gin_trgm_ops — omitted, see manual migrations
])
