import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { deal, deliverable, invoice, payment, clientDealAccess, pipeline, pipelineStage, projectUpdate } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { clientDealIds } from '../../lib/portal-access'
import { PRODUCTION_PIPELINE_LABEL } from '../onboarding/assignees'

type DeliverableRow = typeof deliverable.$inferSelect

/** Proyección del deal expuesta al cliente — NUNCA la fila completa (oculta ownerId/custom/pipelineId). */
export interface ClientDealDTO {
  id: string
  name: string
  amount: string | null
  currency: string
  stageId: string
  createdAt: Date
}

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

export async function clientDeals(clientId: string): Promise<ClientDealDTO[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db
    .select({ id: deal.id, name: deal.name, amount: deal.amount, currency: deal.currency, stageId: deal.stageId, createdAt: deal.createdAt })
    .from(deal)
    .where(and(inArray(deal.id, ids), eq(deal.archived, false)))
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

// ─── Estado de proyecto (fase actual + roadmap + novedades) ─────────────────

export interface ClientProjectPhaseDTO {
  id: string
  label: string
  description: string | null
  displayOrder: number
  isCurrent: boolean
  isDone: boolean
}

export interface ClientProjectUpdateDTO {
  id: string
  body: string
  phaseLabel: string | null
  createdAt: Date
}

export interface ClientProjectDTO {
  deal: { id: string; name: string }
  inProduction: boolean
  currentPhase: { id: string; label: string; description: string | null } | null
  phases: ClientProjectPhaseDTO[] | null
  updates: ClientProjectUpdateDTO[]
}

interface ActiveClientDeal {
  id: string
  portalId: string
  name: string
  pipelineId: string
  stageId: string
}

/**
 * Resuelve el deal activo del cliente autenticado, vía client_deal_access.
 * Mismo patrón que `resolveActiveDeal` en onboarding.service.ts (no exportado
 * desde ahí): si el cliente tiene varios deals, toma el más reciente no
 * archivado.
 */
async function resolveActiveClientDeal(clientId: string): Promise<ActiveClientDeal> {
  const [row] = await db
    .select({ id: deal.id, portalId: deal.portalId, name: deal.name, pipelineId: deal.pipelineId, stageId: deal.stageId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, clientId), eq(deal.archived, false)))
    .orderBy(desc(deal.createdAt))
    .limit(1)
  if (!row) throw Errors.notFound('No hay un proyecto activo asociado a esta cuenta')
  return row
}

/**
 * Estado de proyecto visible al cliente: fase actual dentro del pipeline
 * "Producción" (si el deal ya está ahí), roadmap completo de las 9 fases con
 * `isCurrent`/`isDone`, y las novedades curadas por el equipo (no archivadas).
 * Las novedades se devuelven SIEMPRE (aunque el deal todavía esté en Ventas);
 * `currentPhase`/`phases` solo se resuelven si `inProduction` es true.
 */
export async function getClientProject(clientId: string): Promise<ClientProjectDTO> {
  const activeDeal = await resolveActiveClientDeal(clientId)

  const [pl] = await db.select({ id: pipeline.id, label: pipeline.label }).from(pipeline).where(eq(pipeline.id, activeDeal.pipelineId)).limit(1)
  const inProduction = pl?.label === PRODUCTION_PIPELINE_LABEL

  let currentPhase: ClientProjectDTO['currentPhase'] = null
  let phases: ClientProjectPhaseDTO[] | null = null

  if (inProduction) {
    const stages = await db
      .select({
        id: pipelineStage.id,
        label: pipelineStage.label,
        description: pipelineStage.description,
        displayOrder: pipelineStage.displayOrder,
      })
      .from(pipelineStage)
      .where(and(eq(pipelineStage.pipelineId, activeDeal.pipelineId), eq(pipelineStage.archived, false)))
      .orderBy(asc(pipelineStage.displayOrder))

    const current = stages.find((s) => s.id === activeDeal.stageId)
    const currentDisplayOrder = current?.displayOrder ?? -1

    phases = stages.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      displayOrder: s.displayOrder,
      isCurrent: s.id === activeDeal.stageId,
      isDone: s.displayOrder < currentDisplayOrder,
    }))

    if (current) {
      currentPhase = { id: current.id, label: current.label, description: current.description }
    }
  }

  const updateRows = await db
    .select({ id: projectUpdate.id, body: projectUpdate.body, createdAt: projectUpdate.createdAt, stageLabel: pipelineStage.label })
    .from(projectUpdate)
    .leftJoin(pipelineStage, eq(pipelineStage.id, projectUpdate.stageId))
    .where(and(eq(projectUpdate.dealId, activeDeal.id), eq(projectUpdate.archived, false)))
    .orderBy(desc(projectUpdate.createdAt))
    .limit(20)

  const updates: ClientProjectUpdateDTO[] = updateRows.map((u) => ({
    id: u.id,
    body: u.body,
    phaseLabel: u.stageLabel ?? null,
    createdAt: u.createdAt,
  }))

  return {
    deal: { id: activeDeal.id, name: activeDeal.name },
    inProduction,
    currentPhase,
    phases,
    updates,
  }
}
