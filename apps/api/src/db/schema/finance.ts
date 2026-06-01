import { pgTable, text, integer, numeric, date, timestamp, boolean, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { company } from './companies'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const invoice = pgTable('invoice', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  number: integer('number').notNull(),
  dealId: text('deal_id').references(() => deal.id),
  companyId: text('company_id').references(() => company.id),
  status: text('status').notNull().default('draft'),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => hubUser.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('invoice_status_check', sql`${table.status} IN ('draft','sent','paid','overdue','void')`),
  index('idx_invoice_portal_status').on(table.portalId, table.status),
])

export const invoiceItem = pgTable('invoice_item', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  invoiceId: text('invoice_id').notNull().references(() => invoice.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
}, (table) => [
  index('idx_invoice_item_invoice').on(table.invoiceId),
])

export const payment = pgTable('payment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  invoiceId: text('invoice_id').notNull().references(() => invoice.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  method: text('method').notNull().default('transfer'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference: text('reference'),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('payment_method_check', sql`${table.method} IN ('transfer','card','cash','other')`),
  index('idx_payment_portal').on(table.portalId),
])
