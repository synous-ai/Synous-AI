import { and, desc, eq, inArray, sum } from 'drizzle-orm'
import { db } from '../../db'
import { invoice, invoiceItem, payment, company } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { assertCompanyInPortal, assertDealInPortal } from '../../lib/portal-access'
import { notifyDealClients } from '../notifications/notify'
import type { CreateInvoiceDTO, UpdateInvoiceDTO, ListInvoicesQuery } from './finance.schema'
import {
  num,
  calcAmountBase,
  computeDerivedStatus,
  requireInvoice,
  requireRetainer,
  nextInvoiceNumber,
  type InvoiceRow,
  type InvoiceItemRow,
  type PaymentRow,
} from './finance-shared'

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
): Promise<Paginated<InvoiceRow & {
  derivedStatus: string
  balance: string
  companyName: string | null
}>> {
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

  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(invoice)
    .where(and(...conditions, cursor ? cursorWhere(invoice.createdAt, invoice.id, cursor) : undefined))
    .orderBy(desc(invoice.createdAt), desc(invoice.id))
    .limit(query.limit + 1)
  const { items: invoices, nextCursor } = paginateRows(rows, query.limit)

  if (invoices.length === 0) return { items: [], nextCursor }

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
      .where(and(eq(company.portalId, portalId), inArray(company.id, companyIds)))
    companyMap = new Map(companies.map((c) => [c.id, c.name]))
  }

  const items = invoices.map((inv) => {
    const totalPaid = paidMap.get(inv.id) ?? 0
    const balanceNum = Math.max(0, Number(inv.amountBase) - totalPaid)
    return {
      ...inv,
      balance: num(balanceNum),
      derivedStatus: computeDerivedStatus(inv, balanceNum),
      companyName: inv.companyId ? (companyMap.get(inv.companyId) ?? null) : null,
    }
  })
  return { items, nextCursor }
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
    await assertCompanyInPortal(portalId, input.companyId, tx)
    if (input.dealId) await assertDealInPortal(portalId, input.dealId, tx)
    if (input.retainerId) await requireRetainer(portalId, input.retainerId, tx)
    const next = await nextInvoiceNumber(tx, portalId)

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
  await assertCompanyInPortal(portalId, input.companyId)
  if (input.dealId) await assertDealInPortal(portalId, input.dealId)

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
  const before = await requireInvoice(portalId, id)
  const [row] = await db
    .update(invoice)
    .set({ status, updatedAt: new Date() })
    .where(eq(invoice.id, id))
    .returning()

  // Solo al ENTRAR en 'sent' (no en cada guardado posterior): el cliente tiene
  // algo nuevo que pagar. La dedupeKey por factura hace que re-transicionar no
  // vuelva a avisar.
  if (status === 'sent' && before.status !== 'sent' && row!.dealId) {
    await notifyDealClients(portalId, row!.dealId, 'invoice_sent', {
      invoiceId: row!.id,
      invoiceNumber: row!.number,
      amount: row!.total,
      currency: row!.currency,
    }, {
      entity: { type: 'invoice', id: row!.id },
      dedupeKey: `invoice_sent:${row!.id}`,
    })
  }
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
