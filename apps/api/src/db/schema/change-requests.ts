import { pgTable, text, integer, numeric, date, timestamp, index, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const changeRequest = pgTable('change_request', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').notNull().references(() => deal.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  originalScopeRef: text('original_scope_ref'),
  origin: text('origin').notNull().default('client'),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
  timelineImpactDays: integer('timeline_impact_days').notNull().default(0),
  newDeliveryDate: date('new_delivery_date'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: text('approved_by').references(() => clientAccount.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('change_request_deal_id_number_unique').on(table.dealId, table.number),
  check('change_request_origin_check', sql`${table.origin} IN ('client','agency')`),
  check('change_request_status_check', sql`${table.status} IN ('draft','sent','approved','rejected','negotiating','approved_verbally','disputed','completed')`),
  index('idx_cr_deal').on(table.dealId, table.status),
])

export const changeRequestItem = pgTable('change_request_item', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: numeric('quantity', { precision: 8, scale: 2 }).notNull().default('1'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).generatedAlwaysAs(sql`unit_price * quantity`),
}, (table) => [
  index('idx_cr_item_cr').on(table.changeRequestId),
])

export const changeRequestAttachment = pgTable('change_request_attachment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => hubUser.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
})

export const changeRequestHistory = pgTable('change_request_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  comment: text('comment'),
  changedByUser: text('changed_by_user').references(() => hubUser.id),
  changedByClient: text('changed_by_client').references(() => clientAccount.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const changeRequestComment = pgTable('change_request_comment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  authorUser: text('author_user').references(() => hubUser.id),
  authorClient: text('author_client').references(() => clientAccount.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('change_request_comment_author_check', sql`(${table.authorUser} IS NOT NULL AND ${table.authorClient} IS NULL) OR (${table.authorUser} IS NULL AND ${table.authorClient} IS NOT NULL)`),
  index('idx_cr_comment_cr').on(table.changeRequestId, table.createdAt),
])
