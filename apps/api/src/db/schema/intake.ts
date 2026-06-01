import { pgTable, text, jsonb, timestamp, unique, index, check, bigint } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { createId } from '../../lib/id'

export const intakeForm = pgTable('intake_form', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull(),
  fields: jsonb('fields').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('intake_form_portal_id_slug_unique').on(table.portalId, table.slug),
])

export const dealIntake = pgTable('deal_intake', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  dealId: text('deal_id').notNull().references(() => deal.id, { onDelete: 'cascade' }),
  formId: text('form_id').notNull().references(() => intakeForm.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('deal_intake_status_check', sql`${table.status} IN ('pending','in_progress','completed')`),
  index('idx_deal_intake_deal').on(table.dealId),
])

export const dealIntakeResponse = pgTable('deal_intake_response', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  intakeId: text('intake_id').notNull().references(() => dealIntake.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clientAccount.id),
  answers: jsonb('answers').notNull().default({}),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('deal_intake_response_intake_id_unique').on(table.intakeId),
])

export const clientAsset = pgTable('client_asset', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').notNull().references(() => deal.id),
  clientId: text('client_id').notNull().references(() => clientAccount.id),
  intakeId: text('intake_id').references(() => dealIntake.id),
  fieldName: text('field_name'),
  name: text('name').notNull(),
  type: text('type').notNull(),
  mimeType: text('mime_type'),
  storageKey: text('storage_key').notNull(),
  // sizeBytes is a real size in bytes — kept as bigint (not an ID)
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('client_asset_type_check', sql`${table.type} IN ('logo','foto','documento','acceso','otro')`),
  index('idx_client_asset_deal').on(table.dealId),
])
