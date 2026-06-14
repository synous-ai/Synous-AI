import { pgTable, text, integer, numeric, date, timestamp, boolean, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { company } from './companies'
import { hubUser } from './users'
import { createId } from '../../lib/id'

/**
 * Tabla de abonos mensuales (retainers).
 * Se declara ANTES de invoice porque invoice la referencia por FK.
 */
export const retainer = pgTable('retainer', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  companyId: text('company_id').notNull().references(() => company.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  /** Tipo de cambio al momento de emitir (1 si la moneda base == currency). */
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  /** Monto en moneda base del portal (siempre USD, calculado en el service). */
  amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull(),
  /** Día del mes en que se genera la factura automáticamente (1–28). */
  billingDay: integer('billing_day').notNull(),
  status: text('status').notNull().default('active'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => hubUser.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('retainer_currency_check', sql`${table.currency} IN ('USD','ARS')`),
  check('retainer_status_check', sql`${table.status} IN ('active','paused','cancelled')`),
  // El día de corte se limita al 28 para evitar ambigüedades en meses cortos.
  check('retainer_billing_day_check', sql`${table.billingDay} BETWEEN 1 AND 28`),
  index('idx_retainer_portal_status').on(table.portalId, table.status),
])

/**
 * Facturas emitidas a clientes.
 * Soporta multi-moneda: currency puede ser USD o ARS.
 * amount_base siempre está en la moneda base del portal (USD) y se calcula
 * multiplicando el total por exchange_rate al momento de crear/editar.
 */
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
  /** Tipo de cambio USD/ARS al momento de emitir (1 si currency == 'USD'). */
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  /** total × exchange_rate → monto en USD para comparaciones y reportes. */
  amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  /** Retainer que generó esta factura (null si es una factura puntual). */
  retainerId: text('retainer_id').references(() => retainer.id),
  createdBy: text('created_by').references(() => hubUser.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('invoice_status_check', sql`${table.status} IN ('draft','sent','paid','overdue','void')`),
  check('invoice_currency_check', sql`${table.currency} IN ('USD','ARS')`),
  index('idx_invoice_portal_status').on(table.portalId, table.status),
  index('idx_invoice_retainer').on(table.retainerId),
  index('idx_invoice_deal').on(table.dealId),
  index('idx_invoice_company').on(table.companyId),
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

/**
 * Pagos recibidos contra una factura.
 * Al igual que invoice, soporta pago en USD o ARS con su tipo de cambio.
 */
export const payment = pgTable('payment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  invoiceId: text('invoice_id').notNull().references(() => invoice.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  /** Tipo de cambio al momento del pago (1 si currency == 'USD'). */
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  /** amount × exchange_rate → monto en USD para conciliación. */
  amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull().default('0'),
  method: text('method').notNull().default('transfer'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference: text('reference'),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('payment_method_check', sql`${table.method} IN ('transfer','card','cash','other')`),
  check('payment_currency_check', sql`${table.currency} IN ('USD','ARS')`),
  index('idx_payment_portal').on(table.portalId),
])

/**
 * Gastos del negocio (infraestructura, software, impuestos, etc.).
 * Soporta adjunto de comprobante via storage_key (Cloudflare R2).
 * Todos los gastos se normalizan a USD en amount_base para reportes.
 */
export const expense = pgTable('expense', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  /** Tipo de cambio al momento del gasto (1 si currency == 'USD'). */
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  /** amount × exchange_rate → monto en USD para dashboards y reportes. */
  amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull(),
  category: text('category').notNull(),
  expenseDate: date('expense_date').notNull(),
  vendor: text('vendor'),
  dealId: text('deal_id').references(() => deal.id),
  companyId: text('company_id').references(() => company.id),
  paymentMethod: text('payment_method'),
  /** Si el gasto es recurrente (ej.: suscripción mensual), se marca para alertas. */
  isRecurring: boolean('is_recurring').notNull().default(false),
  notes: text('notes'),
  /** Clave del comprobante subido a R2 (sin URL; la URL se genera on-demand). */
  storageKey: text('storage_key'),
  createdBy: text('created_by').references(() => hubUser.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('expense_currency_check', sql`${table.currency} IN ('USD','ARS')`),
  check(
    'expense_category_check',
    sql`${table.category} IN ('software','infraestructura','equipo','impuestos','oficina','marketing','otros')`,
  ),
  // payment_method es opcional; si viene, solo acepta los valores conocidos.
  check(
    'expense_payment_method_check',
    sql`${table.paymentMethod} IS NULL OR ${table.paymentMethod} IN ('transfer','card','cash','other')`,
  ),
  index('idx_expense_portal_date').on(table.portalId, table.expenseDate),
  index('idx_expense_deal').on(table.dealId),
  index('idx_expense_category').on(table.category),
])
