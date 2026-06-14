/**
 * finance.service.ts — Módulo de Finanzas del CRM NOUS.
 *
 * Cubre: Facturas (multimoneda), Cobros (Payments), Gastos (Expenses),
 * Retainers (MRR) y Resúmenes financieros con filtro de período.
 *
 * Regla multimoneda:
 *   - `currency` + `exchange_rate` se congela al momento del movimiento.
 *   - `amount_base` = moneda base del portal (USD, `numeric(14,2)`).
 *   - Conversión: ARS → USD = amount / exchangeRate; USD → USD = amount.
 *   - Los strings `numeric(14,2)` del DB se operan como Number en el service
 *     y se devuelven como string con toDecimal() para preservar precisión.
 *
 * Todos los errores de negocio se lanzan con AppError vía Errors.*.
 * Todas las operaciones multi-tabla se envuelven en db.transaction().
 */

import { and, asc, between, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import { db } from '../../db'
import {
  invoice,
  invoiceItem,
  payment,
  expense,
  retainer,
  company,
  portal,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import { getDolarRates } from '../../lib/fx'
import { recordFieldChanges } from '../../lib/audit'
import type {
  CreateInvoiceDTO,
  UpdateInvoiceDTO,
  CreatePaymentDTO,
  ListInvoicesQuery,
  ListPaymentsQuery,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  ListExpensesQuery,
  CreateRetainerDTO,
  UpdateRetainerDTO,
  ListRetainersQuery,
  SummaryQuery,
} from './finance.schema'

// ── Tipos internos ────────────────────────────────────────────────────────────

type InvoiceRow = typeof invoice.$inferSelect
type InvoiceItemRow = typeof invoiceItem.$inferSelect
type PaymentRow = typeof payment.$inferSelect
type ExpenseRow = typeof expense.$inferSelect
type RetainerRow = typeof retainer.$inferSelect

// ── Helpers de dinero ─────────────────────────────────────────────────────────

/**
 * Convierte un número a string con 2 decimales.
 * Wraper sobre toDecimal() del lib para uso interno del service.
 */
function num(n: number): string {
  return toDecimal(n) as string
}

/**
 * Calcula el monto en moneda base (USD) a partir del monto y el tipo de cambio.
 * Si currency === 'USD', retorna el monto tal cual (exchangeRate se ignora).
 * Si currency === 'ARS', divide por exchangeRate (ARS/USD).
 */
function calcAmountBase(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'USD') return amount
  // ARS: amount / exchangeRate (ej: 1000 ARS / 1000 ARS per USD = 1 USD)
  return amount / exchangeRate
}

// ── Helpers de query ──────────────────────────────────────────────────────────

/** Devuelve la factura si pertenece al portal y no está archivada. */
async function requireInvoice(portalId: string, id: string): Promise<InvoiceRow> {
  const [row] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), eq(invoice.portalId, portalId), eq(invoice.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Factura no encontrada')
  return row
}

/** Devuelve el gasto si pertenece al portal y no está archivado. */
async function requireExpense(portalId: string, id: string): Promise<ExpenseRow> {
  const [row] = await db
    .select()
    .from(expense)
    .where(and(eq(expense.id, id), eq(expense.portalId, portalId), eq(expense.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Gasto no encontrado')
  return row
}

/** Devuelve el retainer si pertenece al portal y no está archivado. */
async function requireRetainer(portalId: string, id: string): Promise<RetainerRow> {
  const [row] = await db
    .select()
    .from(retainer)
    .where(and(eq(retainer.id, id), eq(retainer.portalId, portalId), eq(retainer.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Retainer no encontrado')
  return row
}

// ── derivedStatus ─────────────────────────────────────────────────────────────

/**
 * Calcula el estado derivado on-read de una factura combinando el status
 * almacenado con el saldo real (invoiceTotal − totalPaid en amountBase).
 *
 * Estados derivados:
 *   - draft   → 'borrador' (manual, nunca se sobreescribe)
 *   - void    → 'anulada'
 *   - sent/paid/overdue:
 *       · balance == 0   → 'pagada'
 *       · balance > 0 && dueDate < hoy → 'vencida'
 *       · balance > 0 && balance < amountBase → 'parcial'
 *       · de lo contrario → 'enviada'
 */
function computeDerivedStatus(
  inv: InvoiceRow,
  balance: number,
): 'borrador' | 'enviada' | 'parcial' | 'pagada' | 'vencida' | 'anulada' {
  if (inv.status === 'draft') return 'borrador'
  if (inv.status === 'void') return 'anulada'

  const amtBase = Number(inv.amountBase)
  if (balance <= 0) return 'pagada'

  const today = new Date().toISOString().slice(0, 10)
  if (inv.dueDate && inv.dueDate < today) return 'vencida'
  if (balance < amtBase) return 'parcial'

  return 'enviada'
}

// ── Facturas ──────────────────────────────────────────────────────────────────

/**
 * Lista facturas del portal con derivedStatus y balance pre-calculados.
 *
 * Soporta tabs:
 *   - 'all' o ninguno: todas las facturas no archivadas
 *   - 'por_cobrar': enviadas o con saldo > 0 (excluye borradores y anuladas)
 *   - 'vencidas': solo las vencidas (dueDate < hoy y saldo > 0)
 *   - 'pagadas': saldo == 0 y no borrador/void
 *   - 'borradores': status === 'draft'
 *
 * Para calcular balance se hace una sola query agrupada por invoice (anti N+1).
 */
export async function listInvoices(
  portalId: string,
  query: ListInvoicesQuery,
): Promise<(InvoiceRow & {
  derivedStatus: string
  balance: string
  companyName: string | null
})[]> {
  // Condiciones base
  const conditions = [eq(invoice.portalId, portalId), eq(invoice.archived, false)]

  // Filtro de tab — los tabs concretos filtran el status almacenado como punto de partida.
  // El derivedStatus final se calcula post-fetch; el tab es una pre-filtración optimista.
  const { tab, status } = query
  if (status) {
    conditions.push(eq(invoice.status, status))
  } else if (tab === 'borradores') {
    conditions.push(eq(invoice.status, 'draft'))
  } else if (tab === 'vencidas') {
    conditions.push(eq(invoice.status, 'overdue'))
  } else if (tab === 'pagadas') {
    conditions.push(eq(invoice.status, 'paid'))
  } else if (tab === 'por_cobrar') {
    conditions.push(inArray(invoice.status, ['sent', 'overdue']))
  }

  const invoices = await db
    .select()
    .from(invoice)
    .where(and(...conditions))
    .orderBy(desc(invoice.createdAt))

  if (invoices.length === 0) return []

  // Obtener totales de pagos agrupados en UNA sola query (anti N+1)
  const ids = invoices.map((i) => i.id)
  const paidByInvoice = await db
    .select({ invoiceId: payment.invoiceId, total: sum(payment.amountBase) })
    .from(payment)
    .where(inArray(payment.invoiceId, ids))
    .groupBy(payment.invoiceId)
  const paidMap = new Map<string, number>(
    paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)]),
  )

  // Resolver company names en UNA query (anti N+1)
  const companyIds = [...new Set(invoices.map((i) => i.companyId).filter(Boolean) as string[])]
  let companyMap = new Map<string, string>()
  if (companyIds.length > 0) {
    const companies = await db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(inArray(company.id, companyIds))
    companyMap = new Map(companies.map((c) => [c.id, c.name]))
  }

  return invoices.map((inv) => {
    const totalPaid = paidMap.get(inv.id) ?? 0
    const balanceNum = Math.max(0, Number(inv.amountBase) - totalPaid)
    return {
      ...inv,
      balance: num(balanceNum),
      derivedStatus: computeDerivedStatus(inv, balanceNum),
      companyName: inv.companyId ? (companyMap.get(inv.companyId) ?? null) : null,
    }
  })
}

/**
 * Detalle de una factura: ítems, cobros y balance pendiente.
 * El balance se calcula en amountBase (USD) para consistencia multimoneda.
 */
export async function getInvoiceDetail(
  portalId: string,
  id: string,
): Promise<{
  invoice: InvoiceRow
  items: InvoiceItemRow[]
  payments: PaymentRow[]
  balance: string
}> {
  const inv = await requireInvoice(portalId, id)
  const items = await db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, id))
  const payments_ = await db
    .select()
    .from(payment)
    .where(eq(payment.invoiceId, id))
    .orderBy(desc(payment.paidAt))

  // El balance se calcula sobre amountBase (USD) porque el pago puede ser en otra moneda.
  const totalPaid = payments_.reduce((acc, p) => acc + Number(p.amountBase), 0)
  const balance = num(Math.max(0, Number(inv.amountBase) - totalPaid))

  return { invoice: inv, items, payments: payments_, balance }
}

/**
 * Crea una factura con sus ítems en una transacción atómica.
 * Calcula subtotal/total a partir de los ítems.
 * Calcula amountBase a partir de currency + exchangeRate (congelado).
 */
export async function createInvoice(
  portalId: string,
  userId: string,
  input: CreateInvoiceDTO,
): Promise<InvoiceRow> {
  return db.transaction(async (tx) => {
    // Numeración secuencial dentro del portal (patrón igual que change requests)
    const [numRow] = await tx
      .select({ next: sql<number>`coalesce(max(${invoice.number}), 0) + 1` })
      .from(invoice)
      .where(eq(invoice.portalId, portalId))
    const next = numRow?.next ?? 1

    // Totales calculados desde los ítems
    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity ?? 1) * it.unitPrice, 0)
    const tax = input.tax ?? 0
    const total = subtotal + tax

    const currency = input.currency ?? 'USD'
    // El TC se congela al momento de emitir. Si es USD, forzamos 1.
    const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
    const amountBase = calcAmountBase(total, currency, exchangeRate)

    const [row] = await tx
      .insert(invoice)
      .values({
        portalId,
        number: next,
        dealId: input.dealId ?? null,
        companyId: input.companyId ?? null,
        status: 'draft',
        issueDate: input.issueDate ?? null,
        dueDate: input.dueDate ?? null,
        currency,
        exchangeRate: num(exchangeRate),
        amountBase: num(amountBase),
        subtotal: num(subtotal),
        tax: num(tax),
        total: num(total),
        notes: input.notes ?? null,
        retainerId: input.retainerId ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear la factura')

    await tx.insert(invoiceItem).values(
      input.items.map((it) => ({
        invoiceId: row.id,
        description: it.description,
        quantity: num(it.quantity ?? 1),
        unitPrice: num(it.unitPrice),
      })),
    )

    return row
  })
}

/**
 * Actualiza campos de una factura en borrador.
 * Recalcula amountBase si cambian currency, exchangeRate o tax.
 * Solo se puede editar cuando status === 'draft'.
 */
export async function updateInvoice(
  portalId: string,
  id: string,
  input: UpdateInvoiceDTO,
): Promise<InvoiceRow> {
  const inv = await requireInvoice(portalId, id)
  if (inv.status !== 'draft') throw Errors.badRequest('Solo se puede editar una factura en borrador')

  const currency = input.currency ?? inv.currency
  const exchangeRate =
    input.exchangeRate != null
      ? (currency === 'ARS' ? input.exchangeRate : 1)
      : Number(inv.exchangeRate)

  // Si cambiaron moneda o TC, recalcular amountBase sobre el total actual
  const needsRecalc = input.currency != null || input.exchangeRate != null
  const amountBase = needsRecalc
    ? calcAmountBase(Number(inv.total), currency, exchangeRate)
    : Number(inv.amountBase)

  const [row] = await db
    .update(invoice)
    .set({
      ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.currency !== undefined ? { currency } : {}),
      ...(needsRecalc ? { exchangeRate: num(exchangeRate), amountBase: num(amountBase) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, id))
    .returning()
  return row!
}

/**
 * Transiciona el estado manual de una factura.
 * Los estados derivados (pagada/vencida/parcial) se calculan on-read;
 * esta función maneja solo estados manuales válidos: draft/sent/void/overdue.
 */
export async function transitionInvoice(
  portalId: string,
  id: string,
  status: string,
): Promise<InvoiceRow> {
  await requireInvoice(portalId, id)
  const [row] = await db
    .update(invoice)
    .set({ status, updatedAt: new Date() })
    .where(eq(invoice.id, id))
    .returning()
  return row!
}

/** Archiva una factura (soft-delete). */
export async function archiveInvoice(portalId: string, id: string): Promise<void> {
  await requireInvoice(portalId, id)
  await db
    .update(invoice)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoice.id, id))
}

// ── Cobros (Payments) ─────────────────────────────────────────────────────────

/**
 * Lista cobros del portal enriquecidos con JOIN a factura y empresa.
 * Soporta filtros de método, fecha, empresa e ID de factura.
 * La respuesta incluye `meta.totalPeriod` (Σ amountBase en el período filtrado).
 */
export async function listPayments(
  portalId: string,
  query: ListPaymentsQuery,
): Promise<{
  payments: (PaymentRow & { invoiceNumber: number | null; invoiceCurrency: string | null; companyName: string | null })[]
  meta: { totalPeriod: string }
}> {
  const conditions = [eq(payment.portalId, portalId)]

  if (query.method) conditions.push(eq(payment.method, query.method))
  if (query.invoiceId) conditions.push(eq(payment.invoiceId, query.invoiceId))
  if (query.from && query.to) {
    conditions.push(between(payment.paidAt, new Date(query.from), new Date(query.to + 'T23:59:59Z')))
  } else if (query.from) {
    conditions.push(gte(payment.paidAt, new Date(query.from)))
  } else if (query.to) {
    conditions.push(lte(payment.paidAt, new Date(query.to + 'T23:59:59Z')))
  }

  const payments_ = await db
    .select()
    .from(payment)
    .where(and(...conditions))
    .orderBy(desc(payment.paidAt))

  if (payments_.length === 0) {
    return { payments: [], meta: { totalPeriod: '0.00' } }
  }

  // Resolver invoice data (número + moneda + company) en UNA query anti N+1
  const invoiceIds = [...new Set(payments_.map((p) => p.invoiceId))]
  const invoiceRows = await db
    .select({ id: invoice.id, number: invoice.number, currency: invoice.currency, companyId: invoice.companyId })
    .from(invoice)
    .where(inArray(invoice.id, invoiceIds))
  const invoiceMap = new Map(invoiceRows.map((r) => [r.id, r]))

  // Resolver empresa en UNA query
  const companyIds = [
    ...new Set(invoiceRows.map((r) => r.companyId).filter(Boolean) as string[]),
  ]

  // Filtrar por companyId si viene en el query (cross-join implícito)
  let companyMap = new Map<string, string>()
  if (companyIds.length > 0) {
    const companies = await db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(inArray(company.id, companyIds))
    companyMap = new Map(companies.map((c) => [c.id, c.name]))
  }

  // Filtro por companyId (post-fetch para mantener la query simple)
  let filtered = payments_
  if (query.companyId) {
    const validInvoiceIds = new Set(
      invoiceRows.filter((r) => r.companyId === query.companyId).map((r) => r.id),
    )
    filtered = payments_.filter((p) => validInvoiceIds.has(p.invoiceId))
  }

  const totalPeriod = filtered.reduce((acc, p) => acc + Number(p.amountBase ?? 0), 0)

  const enriched = filtered.map((p) => {
    const inv = invoiceMap.get(p.invoiceId)
    return {
      ...p,
      invoiceNumber: inv?.number ?? null,
      invoiceCurrency: inv?.currency ?? null,
      companyName: inv?.companyId ? (companyMap.get(inv.companyId) ?? null) : null,
    }
  })

  return { payments: enriched, meta: { totalPeriod: num(totalPeriod) } }
}

/**
 * Registra un cobro para una factura.
 *
 * El TC se congela al momento del pago (puede diferir del TC de la factura:
 * ej. factura en USD cobrada en ARS meses después a otro TC).
 * amountBase se calcula en el service y se almacena; no depende del front.
 */
export async function registerPayment(
  portalId: string,
  userId: string,
  input: CreatePaymentDTO,
): Promise<PaymentRow> {
  return db.transaction(async (tx) => {
    // Validar que la factura exista y pertenezca al portal
    const [inv] = await tx
      .select()
      .from(invoice)
      .where(and(eq(invoice.id, input.invoiceId), eq(invoice.portalId, portalId), eq(invoice.archived, false)))
      .limit(1)
    if (!inv) throw Errors.notFound('Factura no encontrada')

    const currency = input.currency ?? 'USD'
    // TC congelado al momento del pago
    const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
    const amountBase = calcAmountBase(input.amount, currency, exchangeRate)

    const [row] = await tx
      .insert(payment)
      .values({
        portalId,
        invoiceId: input.invoiceId,
        amount: num(input.amount),
        currency,
        exchangeRate: num(exchangeRate),
        amountBase: num(amountBase),
        method: input.method ?? 'transfer',
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        reference: input.reference ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo registrar el cobro')

    // Recalcular saldo de la factura para determinar si quedó pagada.
    // Se usa amountBase en ambos lados para consistencia multimoneda.
    const [totals] = await tx
      .select({ total: sum(payment.amountBase) })
      .from(payment)
      .where(eq(payment.invoiceId, input.invoiceId))
    const totalPaid = Number(totals?.total ?? 0)

    if (totalPaid >= Number(inv.amountBase)) {
      await tx
        .update(invoice)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(invoice.id, input.invoiceId))
    }

    return row
  })
}

// ── Gastos ────────────────────────────────────────────────────────────────────

/**
 * Lista gastos del portal con filtros opcionales por categoría, deal, período y recurrencia.
 */
export async function listExpenses(portalId: string, query: ListExpensesQuery): Promise<ExpenseRow[]> {
  const conditions = [eq(expense.portalId, portalId), eq(expense.archived, false)]

  if (query.category) conditions.push(eq(expense.category, query.category))
  if (query.dealId) conditions.push(eq(expense.dealId, query.dealId))
  if (query.isRecurring != null) conditions.push(eq(expense.isRecurring, query.isRecurring))
  if (query.from && query.to) {
    conditions.push(between(expense.expenseDate, query.from, query.to))
  } else if (query.from) {
    conditions.push(gte(expense.expenseDate, query.from))
  } else if (query.to) {
    conditions.push(lte(expense.expenseDate, query.to))
  }

  return db.select().from(expense).where(and(...conditions)).orderBy(desc(expense.expenseDate))
}

/**
 * Crea un gasto con validación de moneda y cálculo de amountBase.
 * Registra en record_history para auditoría.
 */
export async function createExpense(
  portalId: string,
  userId: string,
  input: CreateExpenseDTO,
): Promise<ExpenseRow> {
  return db.transaction(async (tx) => {
    const currency = input.currency
    const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
    // Si el front envió amountBase pre-calculado, lo usamos; si no, lo calculamos.
    const amountBase = input.amountBase != null
      ? input.amountBase
      : calcAmountBase(input.amount, currency, exchangeRate)

    const [row] = await tx
      .insert(expense)
      .values({
        portalId,
        description: input.description,
        amount: num(input.amount),
        currency,
        exchangeRate: num(exchangeRate),
        amountBase: num(amountBase),
        category: input.category,
        expenseDate: input.expenseDate,
        vendor: input.vendor ?? null,
        dealId: input.dealId ?? null,
        companyId: input.companyId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        isRecurring: input.isRecurring ?? false,
        notes: input.notes ?? null,
        storageKey: input.storageKey ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el gasto')

    // Registrar creación en record_history
    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'expense',
      entityId: row.id,
      before: {},
      after: {
        description: input.description,
        amount: input.amount,
        currency,
        category: input.category,
        expenseDate: input.expenseDate,
      },
      changedBy: userId,
      sourceType: 'API',
    })

    return row
  })
}

/**
 * Actualiza un gasto. Recalcula amountBase si cambian amount/currency/exchangeRate.
 * Registra los campos modificados en record_history.
 */
export async function updateExpense(
  portalId: string,
  id: string,
  userId: string,
  input: UpdateExpenseDTO,
): Promise<ExpenseRow> {
  return db.transaction(async (tx) => {
    const current = await requireExpense(portalId, id)

    const currency = input.currency ?? current.currency
    const amount = input.amount ?? Number(current.amount)
    const exchangeRate =
      input.exchangeRate != null
        ? (currency === 'ARS' ? input.exchangeRate : 1)
        : Number(current.exchangeRate)
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase)

    const patch: Partial<typeof expense.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (input.description != null) patch.description = input.description
    if (input.amount != null) patch.amount = num(input.amount)
    if (input.currency != null) patch.currency = input.currency
    if (needsRecalc) {
      patch.exchangeRate = num(exchangeRate)
      patch.amountBase = num(amountBase)
    }
    if (input.category != null) patch.category = input.category
    if (input.expenseDate != null) patch.expenseDate = input.expenseDate
    if (input.vendor !== undefined) patch.vendor = input.vendor ?? null
    if (input.dealId !== undefined) patch.dealId = input.dealId ?? null
    if (input.companyId !== undefined) patch.companyId = input.companyId ?? null
    if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod ?? null
    if (input.isRecurring != null) patch.isRecurring = input.isRecurring
    if (input.notes !== undefined) patch.notes = input.notes ?? null
    if (input.storageKey !== undefined) patch.storageKey = input.storageKey ?? null

    const [updated] = await tx.update(expense).set(patch).where(eq(expense.id, id)).returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el gasto')

    // Registrar solo los campos que realmente cambiaron
    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'expense',
      entityId: id,
      before: current as unknown as Record<string, unknown>,
      after: patch as Record<string, unknown>,
      changedBy: userId,
      sourceType: 'API',
    })

    return updated
  })
}

/** Archiva un gasto (soft-delete). */
export async function archiveExpense(portalId: string, id: string): Promise<void> {
  await requireExpense(portalId, id)
  await db
    .update(expense)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(expense.id, id))
}

/**
 * Resumen de gastos: total en USD y ARS (para mostrar en ambas monedas),
 * y desglose por categoría (en amountBase/USD).
 */
export async function expenseSummary(
  portalId: string,
): Promise<{ totalExpenses: string; totalExpensesArs: string; byCategory: Record<string, string> }> {
  const expenses = await db
    .select()
    .from(expense)
    .where(and(eq(expense.portalId, portalId), eq(expense.archived, false)))

  let totalUsd = 0
  let totalArs = 0
  const byCategory: Record<string, number> = {}

  for (const e of expenses) {
    const base = Number(e.amountBase)
    totalUsd += base
    // Para el total ARS: si el gasto es en ARS, usamos el amount directamente
    if (e.currency === 'ARS') {
      totalArs += Number(e.amount)
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + base
  }

  return {
    totalExpenses: num(totalUsd),
    totalExpensesArs: num(totalArs),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, num(v)]),
    ),
  }
}

// ── Retainers ─────────────────────────────────────────────────────────────────

/**
 * Lista retainers con JOIN a company para enriquecer con companyName.
 * Filtra por status y/o companyId si vienen en el query.
 */
export async function listRetainers(
  portalId: string,
  query: ListRetainersQuery,
): Promise<(RetainerRow & { companyName: string | null })[]> {
  const conditions = [eq(retainer.portalId, portalId), eq(retainer.archived, false)]
  if (query.status) conditions.push(eq(retainer.status, query.status))
  if (query.companyId) conditions.push(eq(retainer.companyId, query.companyId))

  const retainers = await db
    .select()
    .from(retainer)
    .where(and(...conditions))
    .orderBy(asc(retainer.startDate))

  if (retainers.length === 0) return []

  const companyIds = [...new Set(retainers.map((r) => r.companyId))]
  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(inArray(company.id, companyIds))
  const companyMap = new Map(companies.map((c) => [c.id, c.name]))

  return retainers.map((r) => ({ ...r, companyName: companyMap.get(r.companyId) ?? null }))
}

/**
 * Detalle de un retainer: datos del retainer + facturas vinculadas.
 */
export async function getRetainerDetail(
  portalId: string,
  id: string,
): Promise<RetainerRow & { companyName: string | null; invoices: InvoiceRow[] }> {
  const ret = await requireRetainer(portalId, id)

  const [companyRow] = await db
    .select({ name: company.name })
    .from(company)
    .where(eq(company.id, ret.companyId))
    .limit(1)

  const invoices_ = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.retainerId, id), eq(invoice.archived, false)))
    .orderBy(desc(invoice.createdAt))

  return {
    ...ret,
    companyName: companyRow?.name ?? null,
    invoices: invoices_,
  }
}

/**
 * Crea un retainer. Calcula amountBase en el service si no viene pre-calculado.
 */
export async function createRetainer(
  portalId: string,
  userId: string,
  input: CreateRetainerDTO,
): Promise<RetainerRow & { companyName: string | null }> {
  // Verificar que la empresa exista y pertenezca al portal
  const [companyRow] = await db
    .select()
    .from(company)
    .where(and(eq(company.id, input.companyId), eq(company.portalId, portalId)))
    .limit(1)
  if (!companyRow) throw Errors.notFound('Empresa no encontrada')

  const currency = input.currency
  const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
  const amountBase = input.amountBase != null
    ? input.amountBase
    : calcAmountBase(input.amount, currency, exchangeRate)

  const [row] = await db
    .insert(retainer)
    .values({
      portalId,
      companyId: input.companyId,
      amount: num(input.amount),
      currency,
      exchangeRate: num(exchangeRate),
      amountBase: num(amountBase),
      billingDay: input.billingDay,
      status: 'active',
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el retainer')

  return { ...row, companyName: companyRow.name }
}

/**
 * Actualiza un retainer. Recalcula amountBase si cambia monto/moneda/TC.
 * Un retainer cancelado no puede reactivarse.
 */
export async function updateRetainer(
  portalId: string,
  id: string,
  input: UpdateRetainerDTO,
): Promise<RetainerRow & { companyName: string | null }> {
  return db.transaction(async (tx) => {
    const current = await requireRetainer(portalId, id)

    // Un retainer cancelado no puede volver a activarse ni pausarse
    if (current.status === 'cancelled' && input.status && input.status !== 'cancelled') {
      throw Errors.badRequest('Un retainer cancelado no puede reactivarse')
    }

    const currency = input.currency ?? current.currency
    const amount = input.amount ?? Number(current.amount)
    const exchangeRate =
      input.exchangeRate != null
        ? (currency === 'ARS' ? input.exchangeRate : 1)
        : Number(current.exchangeRate)
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase)

    const [updated] = await tx
      .update(retainer)
      .set({
        ...(input.status != null ? { status: input.status } : {}),
        ...(input.amount != null ? { amount: num(input.amount) } : {}),
        ...(input.currency != null ? { currency } : {}),
        ...(needsRecalc ? { exchangeRate: num(exchangeRate), amountBase: num(amountBase) } : {}),
        ...(input.billingDay != null ? { billingDay: input.billingDay } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(retainer.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el retainer')

    const [companyRow] = await db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, updated.companyId))
      .limit(1)

    return { ...updated, companyName: companyRow?.name ?? null }
  })
}

/** Archiva un retainer (soft-delete). */
export async function archiveRetainer(portalId: string, id: string): Promise<void> {
  await requireRetainer(portalId, id)
  await db
    .update(retainer)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(retainer.id, id))
}

/**
 * Genera la factura mensual para un retainer (operación idempotente).
 *
 * Idempotencia: si ya existe una factura de este retainer con issueDate en el
 * mes actual (YYYY-MM), no crea otra — devuelve la existente con created=false.
 * Esto evita duplicados si el cron o el usuario llaman múltiples veces en el mismo mes.
 *
 * El importe y la moneda se copian del retainer (con amountBase congelado).
 */
export async function generateRetainerInvoice(
  portalId: string,
  retainerId: string,
  userId: string,
): Promise<{ invoice: InvoiceRow; created: boolean }> {
  return db.transaction(async (tx) => {
    const ret = await requireRetainer(portalId, retainerId)

    if (ret.status !== 'active') {
      throw Errors.badRequest('Solo se puede generar factura para un retainer activo')
    }

    // Idempotencia: buscar factura del mes actual para este retainer
    const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
    const [existing] = await tx
      .select()
      .from(invoice)
      .where(
        and(
          eq(invoice.retainerId, retainerId),
          eq(invoice.archived, false),
          // issueDate LIKE 'YYYY-MM-%'
          sql`${invoice.issueDate} LIKE ${currentMonth + '-%'}`,
        ),
      )
      .limit(1)

    if (existing) return { invoice: existing, created: false }

    // Numeración secuencial dentro del portal
    const [numRow] = await tx
      .select({ next: sql<number>`coalesce(max(${invoice.number}), 0) + 1` })
      .from(invoice)
      .where(eq(invoice.portalId, portalId))
    const next = numRow?.next ?? 1

    const today = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
    const [row] = await tx
      .insert(invoice)
      .values({
        portalId,
        number: next,
        companyId: ret.companyId,
        status: 'draft',
        issueDate: today,
        // vencimiento = mismo día del billing day del mes actual
        dueDate: `${currentMonth}-${String(ret.billingDay).padStart(2, '0')}`,
        currency: ret.currency,
        exchangeRate: ret.exchangeRate,
        amountBase: ret.amountBase,
        subtotal: ret.amount,
        tax: '0',
        total: ret.amount,
        notes: `Factura automática — retainer ${retainerId.slice(-6)}`,
        retainerId,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo generar la factura del retainer')

    // Ítem único: describe el servicio mensual
    await tx.insert(invoiceItem).values({
      invoiceId: row.id,
      description: 'Honorarios mensuales (retainer)',
      quantity: '1',
      unitPrice: ret.amount,
    })

    return { invoice: row, created: true }
  })
}

// ── Resumen financiero ────────────────────────────────────────────────────────

/**
 * Resumen financiero completo con filtro de período.
 *
 * Separa FLUJOS (scoped al período from/to) de SNAPSHOTS (estado actual):
 *   Flujos (scoped):
 *     - totalInvoiced: Σ amountBase de facturas no-void emitidas en el período
 *     - totalPaid: Σ amountBase de cobros registrados en el período
 *     - totalExpenses: Σ amountBase de gastos en el período
 *     - netProfit: totalPaid − totalExpenses (cobrado − gastado)
 *   Snapshots (siempre actuales, sin filtro de fecha):
 *     - outstanding: saldo pendiente de facturas sent/overdue
 *     - mrr: Σ amountBase de retainers activos
 *     - invoicesByStatus: conteo de facturas por status (no archivadas)
 */
export async function financeSummary(
  portalId: string,
  query: SummaryQuery,
): Promise<{
  totalInvoiced: string
  totalPaid: string
  outstanding: string
  totalExpenses: string
  netProfit: string
  mrr: string
  invoicesByStatus: Record<string, number>
}> {
  // ── Flujos scoped al período ────────────────────────────────────────────────

  // Facturas del período (issueDate en el rango)
  const invoiceConds = [eq(invoice.portalId, portalId), eq(invoice.archived, false)]
  if (query.from && query.to) {
    invoiceConds.push(between(invoice.issueDate, query.from, query.to))
  } else if (query.from) {
    invoiceConds.push(gte(invoice.issueDate, query.from))
  } else if (query.to) {
    invoiceConds.push(lte(invoice.issueDate, query.to))
  }

  const invoicesInPeriod = await db
    .select()
    .from(invoice)
    .where(and(...invoiceConds))

  const totalInvoiced = invoicesInPeriod
    .filter((i) => i.status !== 'void')
    .reduce((acc, i) => acc + Number(i.amountBase), 0)

  const invoicesByStatus: Record<string, number> = {}
  for (const inv of invoicesInPeriod) {
    invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] ?? 0) + 1
  }

  // Cobros del período (paidAt en el rango)
  const paymentConds = [eq(payment.portalId, portalId)]
  if (query.from && query.to) {
    paymentConds.push(between(payment.paidAt, new Date(query.from), new Date(query.to + 'T23:59:59Z')))
  } else if (query.from) {
    paymentConds.push(gte(payment.paidAt, new Date(query.from)))
  } else if (query.to) {
    paymentConds.push(lte(payment.paidAt, new Date(query.to + 'T23:59:59Z')))
  }

  const [payTotals] = await db
    .select({ total: sum(payment.amountBase) })
    .from(payment)
    .where(and(...paymentConds))
  const totalPaid = Number(payTotals?.total ?? 0)

  // Gastos del período (expenseDate en el rango)
  const expenseConds = [eq(expense.portalId, portalId), eq(expense.archived, false)]
  if (query.from && query.to) {
    expenseConds.push(between(expense.expenseDate, query.from, query.to))
  } else if (query.from) {
    expenseConds.push(gte(expense.expenseDate, query.from))
  } else if (query.to) {
    expenseConds.push(lte(expense.expenseDate, query.to))
  }

  const [expTotals] = await db
    .select({ total: sum(expense.amountBase) })
    .from(expense)
    .where(and(...expenseConds))
  const totalExpenses = Number(expTotals?.total ?? 0)

  const netProfit = totalPaid - totalExpenses

  // ── Snapshots (estado actual, sin filtro de período) ────────────────────────

  // CxC: saldo pendiente de facturas sent + overdue (en amountBase)
  const openInvoices = await db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.portalId, portalId),
        eq(invoice.archived, false),
        inArray(invoice.status, ['sent', 'overdue']),
      ),
    )

  let outstanding = 0
  if (openInvoices.length > 0) {
    const openIds = openInvoices.map((i) => i.id)
    const paidByInvoice = await db
      .select({ invoiceId: payment.invoiceId, total: sum(payment.amountBase) })
      .from(payment)
      .where(inArray(payment.invoiceId, openIds))
      .groupBy(payment.invoiceId)
    const paidMap = new Map<string, number>(
      paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)]),
    )
    for (const inv of openInvoices) {
      outstanding += Math.max(0, Number(inv.amountBase) - (paidMap.get(inv.id) ?? 0))
    }
  }

  // MRR: Σ amountBase de retainers activos
  const [mrrRow] = await db
    .select({ total: sum(retainer.amountBase) })
    .from(retainer)
    .where(and(eq(retainer.portalId, portalId), eq(retainer.status, 'active'), eq(retainer.archived, false)))
  const mrr = Number(mrrRow?.total ?? 0)

  return {
    totalInvoiced: num(totalInvoiced),
    totalPaid: num(totalPaid),
    outstanding: num(outstanding),
    totalExpenses: num(totalExpenses),
    netProfit: num(netProfit),
    mrr: num(mrr),
    invoicesByStatus,
  }
}

/**
 * Ingresos vs. gastos por mes para el gráfico de barras agrupadas.
 * Devuelve los últimos `months` meses (default 6), en orden cronológico.
 *
 * Cada punto: { month: 'YYYY-MM', income: totalPaid, expenses: totalExpenses, net }
 */
export async function monthlySummary(
  portalId: string,
  months = 6,
): Promise<{ month: string; income: string; expenses: string; net: string }[]> {
  // Generar los N meses hacia atrás desde hoy
  const now = new Date()
  const points: { month: string; income: number; expenses: number }[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = d.toISOString().slice(0, 7) // 'YYYY-MM'
    points.push({ month, income: 0, expenses: 0 })
  }

  const from = points[0]!.month + '-01'
  const to = now.toISOString().slice(0, 10)

  // Cobros por mes (agrupados con DATE_TRUNC)
  const incomeRows = await db
    .select({
      month: sql<string>`to_char(${payment.paidAt}, 'YYYY-MM')`,
      total: sum(payment.amountBase),
    })
    .from(payment)
    .where(and(eq(payment.portalId, portalId), gte(payment.paidAt, new Date(from))))
    .groupBy(sql`to_char(${payment.paidAt}, 'YYYY-MM')`)

  // Gastos por mes
  const expenseRows = await db
    .select({
      month: sql<string>`to_char(${expense.expenseDate}::date, 'YYYY-MM')`,
      total: sum(expense.amountBase),
    })
    .from(expense)
    .where(
      and(
        eq(expense.portalId, portalId),
        eq(expense.archived, false),
        between(expense.expenseDate, from, to),
      ),
    )
    .groupBy(sql`to_char(${expense.expenseDate}::date, 'YYYY-MM')`)

  const incomeMap = new Map(incomeRows.map((r) => [r.month, Number(r.total ?? 0)]))
  const expenseMap = new Map(expenseRows.map((r) => [r.month, Number(r.total ?? 0)]))

  return points.map((p) => {
    const income = incomeMap.get(p.month) ?? 0
    const expenses = expenseMap.get(p.month) ?? 0
    return { month: p.month, income: num(income), expenses: num(expenses), net: num(income - expenses) }
  })
}

/**
 * Top deudores: empresas con mayor saldo pendiente de CxC.
 * Útil para el widget de "Cuentas por cobrar por cliente" en el dashboard.
 */
export async function topDebtors(
  portalId: string,
  limit = 5,
): Promise<{ companyId: string; companyName: string; outstanding: string }[]> {
  // Facturas abiertas (sent + overdue) con company
  const openInvoices = await db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.portalId, portalId),
        eq(invoice.archived, false),
        inArray(invoice.status, ['sent', 'overdue']),
      ),
    )

  if (openInvoices.length === 0) return []

  const openIds = openInvoices.map((i) => i.id)
  const paidByInvoice = await db
    .select({ invoiceId: payment.invoiceId, total: sum(payment.amountBase) })
    .from(payment)
    .where(inArray(payment.invoiceId, openIds))
    .groupBy(payment.invoiceId)
  const paidMap = new Map<string, number>(
    paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)]),
  )

  // Agrupar saldo por empresa
  const debtorMap = new Map<string, number>()
  for (const inv of openInvoices) {
    if (!inv.companyId) continue
    const balance = Math.max(0, Number(inv.amountBase) - (paidMap.get(inv.id) ?? 0))
    debtorMap.set(inv.companyId, (debtorMap.get(inv.companyId) ?? 0) + balance)
  }

  if (debtorMap.size === 0) return []

  // Resolver nombres
  const companyIds = [...debtorMap.keys()].slice(0, 50) // safety cap
  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(inArray(company.id, companyIds))
  const companyMap = new Map(companies.map((c) => [c.id, c.name]))

  return [...debtorMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([companyId, outstanding]) => ({
      companyId,
      companyName: companyMap.get(companyId) ?? companyId,
      outstanding: num(outstanding),
    }))
}

// ── Tipo de cambio ────────────────────────────────────────────────────────────

/**
 * Expone las cotizaciones ARS/USD (blue + tarjeta) del endpoint de la API.
 * Delegado completamente a lib/fx.ts con caché de 10 minutos.
 */
export { getDolarRates }

// ── PDF de factura ────────────────────────────────────────────────────────────

export interface InvoicePdfResult {
  filename: string
  pdf: string // base64
}

/**
 * Genera el PDF de una factura usando easyinvoice (CJS).
 * La importación dinámica maneja el contexto ESM/CJS del proyecto.
 */
export async function generateInvoicePdf(
  portalId: string,
  id: string,
): Promise<InvoicePdfResult> {
  const { invoice: inv, items } = await getInvoiceDetail(portalId, id)

  const [portalRow] = await db
    .select({ name: portal.name })
    .from(portal)
    .where(eq(portal.id, portalId))
    .limit(1)
  const portalName = portalRow?.name ?? 'NOUS'

  let companyName = '—'
  if (inv.companyId) {
    const [companyRow] = await db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, inv.companyId))
      .limit(1)
    companyName = companyRow?.name ?? '—'
  }

  // easyinvoice es CJS — importación dinámica para compatibilidad ESM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const easyinvoice = (await import('easyinvoice')).default as any
  const result = await easyinvoice.createInvoice({
    apiKey: 'free',
    sender: { company: portalName },
    client: { company: companyName },
    information: {
      number: String(inv.number),
      date: inv.issueDate ?? undefined,
      dueDate: inv.dueDate ?? undefined,
    },
    products: items.map((item) => ({
      quantity: String(item.quantity),
      description: item.description,
      taxRate: 0,
      price: Number(item.unitPrice),
    })),
    settings: { currency: inv.currency ?? 'USD' },
  })

  return { filename: `factura-${inv.number}.pdf`, pdf: result.pdf }
}
