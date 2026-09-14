import { and, between, desc, eq, gte, inArray, lte, sum } from 'drizzle-orm'
import { db } from '../../db'
import { invoice, payment, company } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { notifyAdmins, notifyDealClients } from '../notifications/notify'
import type { CreatePaymentDTO, ListPaymentsQuery } from './finance.schema'
import { num, calcAmountBase, type PaymentRow } from './finance-shared'

// ── Cobros (Payments) ─────────────────────────────────────────────────────────

/**
 * Lista cobros del portal enriquecidos con JOIN a factura y empresa.
 * Soporta filtros de método, fecha, empresa e ID de factura.
 * La respuesta incluye `totalPeriod`: Σ amountBase de TODO el filtro, no solo de la página.
 */
export async function listPayments(
  portalId: string,
  query: ListPaymentsQuery,
): Promise<
  Paginated<PaymentRow & { invoiceNumber: number | null; invoiceCurrency: string | null; companyName: string | null }> & {
    totalPeriod: string
  }
> {
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

  // El filtro por empresa va en SQL: aplicado sobre la página ya cortada dejaba
  // páginas cortas o vacías y un total que no era el del filtro.
  if (query.companyId) {
    conditions.push(
      inArray(
        payment.invoiceId,
        db
          .select({ id: invoice.id })
          .from(invoice)
          .where(and(eq(invoice.portalId, portalId), eq(invoice.companyId, query.companyId))),
      ),
    )
  }

  const cursor = decodeCursor(query.cursor)
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(payment)
      .where(and(...conditions, cursor ? cursorWhere(payment.paidAt, payment.id, cursor) : undefined))
      .orderBy(desc(payment.paidAt), desc(payment.id))
      .limit(query.limit + 1),
    db.select({ total: sum(payment.amountBase) }).from(payment).where(and(...conditions)),
  ])
  const { items: payments_, nextCursor } = paginateRows(rows, query.limit, (p) => ({ createdAt: p.paidAt, id: p.id }))
  const totalPeriod = num(Number(totals?.total ?? 0))

  if (payments_.length === 0) return { items: [], nextCursor, totalPeriod }

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

  let companyMap = new Map<string, string>()
  if (companyIds.length > 0) {
    const companies = await db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(and(eq(company.portalId, portalId), inArray(company.id, companyIds)))
    companyMap = new Map(companies.map((c) => [c.id, c.name]))
  }

  const enriched = payments_.map((p) => {
    const inv = invoiceMap.get(p.invoiceId)
    return {
      ...p,
      invoiceNumber: inv?.number ?? null,
      invoiceCurrency: inv?.currency ?? null,
      companyName: inv?.companyId ? (companyMap.get(inv.companyId) ?? null) : null,
    }
  })

  return { items: enriched, nextCursor, totalPeriod }
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

    return { row, invoice: inv, saldada: totalPaid >= Number(inv.amountBase) }
  }).then(async ({ row, invoice: inv, saldada }) => {
    // Avisos DESPUÉS del commit: si fueran adentro, un fallo de notificación
    // revertiría un cobro ya registrado. notify nunca lanza, así que esto no
    // puede romper el registro del pago.
    await notifyAdmins(portalId, 'payment_received', {
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      amount: row.amount,
      currency: row.currency,
    }, {
      entity: { type: 'payment', id: row.id },
      // Un cobro por id es un hecho único: reintentos del mismo insert no
      // deben duplicar el aviso.
      dedupeKey: `payment_received:${row.id}`,
    })

    if (saldada && inv.dealId) {
      await notifyDealClients(portalId, inv.dealId, 'invoice_paid', {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
      }, {
        entity: { type: 'invoice', id: inv.id },
        dedupeKey: `invoice_paid:${inv.id}`,
      })
    }

    return row
  })
}
