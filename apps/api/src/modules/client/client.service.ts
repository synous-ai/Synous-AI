import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { deal, deliverable, invoice, payment } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { clientDealIds } from '../../lib/portal-access'

type DealRow = typeof deal.$inferSelect
type DeliverableRow = typeof deliverable.$inferSelect

export interface ClientInvoiceDTO {
  id: string
  number: number
  total: string
  currency: string
  status: string
  issueDate: string | null
  dueDate: string | null
  balance: string
}

export async function clientDeals(clientId: string): Promise<DealRow[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db.select().from(deal).where(and(inArray(deal.id, ids), eq(deal.archived, false)))
}

export async function clientDeliverables(clientId: string): Promise<DeliverableRow[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db.select().from(deliverable).where(inArray(deliverable.dealId, ids)).orderBy(desc(deliverable.createdAt))
}

async function assertClientDeliverable(clientId: string, deliverableId: string): Promise<DeliverableRow> {
  const ids = await clientDealIds(clientId)
  const [dv] = await db.select().from(deliverable).where(eq(deliverable.id, deliverableId)).limit(1)
  if (!dv || !ids.includes(dv.dealId)) throw Errors.notFound('Entregable no encontrado')
  return dv
}

export async function approveDeliverable(clientId: string, deliverableId: string): Promise<void> {
  await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'approved', reviewedBy: clientId, reviewedAt: new Date(), feedback: null })
    .where(eq(deliverable.id, deliverableId))
}

export async function requestChanges(clientId: string, deliverableId: string, feedback: string): Promise<void> {
  await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'changes_requested', reviewedBy: clientId, reviewedAt: new Date(), feedback })
    .where(eq(deliverable.id, deliverableId))
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listClientInvoices(clientId: string): Promise<ClientInvoiceDTO[]> {
  const dealIds = await clientDealIds(clientId)
  if (dealIds.length === 0) return []

  // Fetch invoices for the client's deals (non-archived)
  const invoices = await db
    .select()
    .from(invoice)
    .where(and(inArray(invoice.dealId, dealIds), eq(invoice.archived, false)))
    .orderBy(desc(invoice.createdAt))

  if (invoices.length === 0) return []

  // Aggregate payments per invoice in a single query — no N+1
  const invoiceIds = invoices.map((inv) => inv.id)
  const paymentTotals = await db
    .select({
      invoiceId: payment.invoiceId,
      paid: sql<string>`COALESCE(SUM(${payment.amount}), '0')`,
    })
    .from(payment)
    .where(inArray(payment.invoiceId, invoiceIds))
    .groupBy(payment.invoiceId)

  const paidByInvoice = new Map<string, number>(
    paymentTotals.map((r) => [r.invoiceId, Number(r.paid)]),
  )

  return invoices.map((inv) => {
    const totalPaid = paidByInvoice.get(inv.id) ?? 0
    const balance = Math.max(0, Number(inv.total) - totalPaid)
    return {
      id: inv.id,
      number: inv.number,
      total: inv.total,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issueDate ?? null,
      dueDate: inv.dueDate ?? null,
      balance: balance.toFixed(2),
    }
  })
}
