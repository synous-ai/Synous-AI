import { and, desc, eq, inArray, sql, sum } from 'drizzle-orm'
import type { InvoiceData } from 'easyinvoice'
import { db } from '../../db'
import { invoice, invoiceItem, payment, company, portal } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import type { CreateInvoiceDTO, UpdateInvoiceDTO, CreatePaymentDTO, ListInvoicesQuery } from './finance.schema'

type InvoiceRow = typeof invoice.$inferSelect
type InvoiceItemRow = typeof invoiceItem.$inferSelect
type PaymentRow = typeof payment.$inferSelect

/** Formatea un número como string con 2 decimales. */
function num(n: number): string {
  return toDecimal(n) as string
}

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

// ── Invoices ─────────────────────────────────────────────────────────────────

export async function listInvoices(portalId: string, query: ListInvoicesQuery): Promise<InvoiceRow[]> {
  const conditions = [
    eq(invoice.portalId, portalId),
    eq(invoice.archived, false),
    ...(query.status ? [eq(invoice.status, query.status)] : []),
  ]
  return db.select().from(invoice).where(and(...conditions)).orderBy(desc(invoice.createdAt))
}

export async function getInvoiceDetail(
  portalId: string,
  id: string,
): Promise<{ invoice: InvoiceRow; items: InvoiceItemRow[]; payments: PaymentRow[]; balance: string }> {
  const inv = await requireInvoice(portalId, id)
  const items = await db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, id))
  const payments_ = await db
    .select()
    .from(payment)
    .where(eq(payment.invoiceId, id))
    .orderBy(desc(payment.paidAt))

  const totalPaid = payments_.reduce((acc, p) => acc + Number(p.amount), 0)
  const balance = num(Math.max(0, Number(inv.total) - totalPaid))

  return { invoice: inv, items, payments: payments_, balance }
}

export async function createInvoice(
  portalId: string,
  userId: string,
  input: CreateInvoiceDTO,
): Promise<InvoiceRow> {
  return db.transaction(async (tx) => {
    // Numeración relativa al portal (coalesce pattern igual que CR)
    const [numRow] = await tx
      .select({ next: sql<number>`coalesce(max(${invoice.number}), 0) + 1` })
      .from(invoice)
      .where(eq(invoice.portalId, portalId))
    const next = numRow?.next ?? 1

    // Calcular subtotal desde los ítems
    const subtotal = input.items.reduce((acc, it) => {
      return acc + (it.quantity ?? 1) * it.unitPrice
    }, 0)
    const tax = input.tax ?? 0
    const total = subtotal + tax

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
        currency: input.currency ?? 'USD',
        notes: input.notes ?? null,
        subtotal: num(subtotal),
        tax: num(tax),
        total: num(total),
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

export async function updateInvoice(
  portalId: string,
  id: string,
  input: UpdateInvoiceDTO,
): Promise<InvoiceRow> {
  const inv = await requireInvoice(portalId, id)
  if (inv.status !== 'draft') throw Errors.badRequest('Solo se puede editar una factura en borrador')

  const [row] = await db
    .update(invoice)
    .set({
      ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, id))
    .returning()
  return row!
}

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

export async function archiveInvoice(portalId: string, id: string): Promise<void> {
  await requireInvoice(portalId, id)
  await db
    .update(invoice)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoice.id, id))
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function listPayments(portalId: string): Promise<PaymentRow[]> {
  return db.select().from(payment).where(eq(payment.portalId, portalId)).orderBy(desc(payment.paidAt))
}

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

    const [row] = await tx
      .insert(payment)
      .values({
        portalId,
        invoiceId: input.invoiceId,
        amount: num(input.amount),
        method: input.method ?? 'transfer',
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        reference: input.reference ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo registrar el pago')

    // Sumar todos los pagos para ver si la factura queda pagada
    const [totals] = await tx
      .select({ total: sum(payment.amount) })
      .from(payment)
      .where(eq(payment.invoiceId, input.invoiceId))
    const totalPaid = Number(totals?.total ?? 0)

    if (totalPaid >= Number(inv.total)) {
      await tx
        .update(invoice)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(invoice.id, input.invoiceId))
    }

    return row
  })
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  totalInvoiced: string
  totalPaid: string
  outstanding: string
  invoicesByStatus: Record<string, number>
}

export async function financeSummary(portalId: string): Promise<FinanceSummary> {
  // Total facturado (todas las facturas no archivadas ni void)
  const activeStatuses = ['draft', 'sent', 'paid', 'overdue']
  const invoices = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.portalId, portalId), eq(invoice.archived, false)))

  const nonVoidInvoices = invoices.filter((i) => i.status !== 'void')
  const totalInvoiced = nonVoidInvoices.reduce((acc, i) => acc + Number(i.total), 0)

  // Total pagado (suma de todos los pagos del portal)
  const [payTotals] = await db
    .select({ total: sum(payment.amount) })
    .from(payment)
    .where(eq(payment.portalId, portalId))
  const totalPaid = Number(payTotals?.total ?? 0)

  // CxC: balance pendiente de facturas sent + overdue
  const openInvoices = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue')
  // UNA sola query agrupada en lugar de un loop N+1
  let outstanding = 0
  if (openInvoices.length > 0) {
    const openIds = openInvoices.map((i) => i.id)
    const paidByInvoice = await db
      .select({ invoiceId: payment.invoiceId, total: sum(payment.amount) })
      .from(payment)
      .where(inArray(payment.invoiceId, openIds))
      .groupBy(payment.invoiceId)
    const paidMap = new Map<string, number>(
      paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)]),
    )
    for (const inv of openInvoices) {
      const paid = paidMap.get(inv.id) ?? 0
      outstanding += Math.max(0, Number(inv.total) - paid)
    }
  }

  // Conteo por status
  const invoicesByStatus: Record<string, number> = {}
  for (const inv of invoices) {
    invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] ?? 0) + 1
  }

  return {
    totalInvoiced: num(totalInvoiced),
    totalPaid: num(totalPaid),
    outstanding: num(outstanding),
    invoicesByStatus,
  }
}

// ── Invoice PDF ──────────────────────────────────────────────────────────────

export interface InvoicePdfResult {
  filename: string
  pdf: string // base64
}

export async function generateInvoicePdf(
  portalId: string,
  id: string,
): Promise<InvoicePdfResult> {
  const { invoice: inv, items } = await getInvoiceDetail(portalId, id)

  // Resolve portal name
  const [portalRow] = await db
    .select({ name: portal.name })
    .from(portal)
    .where(eq(portal.id, portalId))
    .limit(1)
  const portalName = portalRow?.name ?? 'DevDúo'

  // Resolve company name if present
  let companyName = '—'
  if (inv.companyId) {
    const [companyRow] = await db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, inv.companyId))
      .limit(1)
    companyName = companyRow?.name ?? '—'
  }

  const data: InvoiceData = {
    apiKey: 'free',
    sender: {
      company: portalName,
    },
    client: {
      company: companyName,
    },
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
    settings: {
      currency: inv.currency ?? 'USD',
    },
  }

  // easyinvoice is CJS; dynamic import handles both ESM and CJS contexts
  const easyinvoice = (await import('easyinvoice')).default
  const result = await easyinvoice.createInvoice(data)

  return {
    filename: `factura-${inv.number}.pdf`,
    pdf: result.pdf,
  }
}
