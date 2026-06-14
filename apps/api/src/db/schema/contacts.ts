import { pgTable, text, boolean, jsonb, timestamp, index, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { company } from './companies'
import { citext } from './_custom'
import { createId } from '../../lib/id'

export const contact = pgTable('contact', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => hubUser.id, { onDelete: 'set null' }),
  companyId: text('company_id').references(() => company.id, { onDelete: 'set null' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: citext('email'),
  phone: text('phone'),
  jobTitle: text('job_title'),
  lifecycleStage: text('lifecycle_stage').notNull().default('lead'),
  custom: jsonb('custom').notNull().default({}),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('contact_portal_id_email_unique').on(table.portalId, table.email),
  check('contact_lifecycle_stage_check', sql`${table.lifecycleStage} IN ('lead','mql','sql','opportunity','customer','other')`),
  // Compuesto para el listado paginado por cursor (created_at DESC, id DESC).
  index('idx_contact_portal_created').on(table.portalId, table.createdAt, table.id).where(sql`archived = false`),
  index('idx_contact_company').on(table.companyId),
  index('idx_contact_owner').on(table.ownerId),
  index('idx_contact_email').on(table.email),
])
