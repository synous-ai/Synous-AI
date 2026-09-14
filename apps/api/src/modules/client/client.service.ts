import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { deal, deliverable, invoice, payment, clientDealAccess, pipeline, pipelineStage, projectUpdate } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { clientDealIds } from '../../lib/portal-access'
import { PRODUCTION_PIPELINE_LABEL } from '../onboarding/assignees'
import { notifyAdmins } from '../notifications/notify'
import { isInvoiceOverdue } from '../finance/finance-shared'

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
  /**
   * Derivado con la MISMA lógica de fecha que el admin (`isInvoiceOverdue` en
   * finance-shared.ts), no del `status` almacenado — ese solo cambia con una
   * transición manual del equipo (no hay cron). `status` se deja intacto para
   * no romper nada que ya dependa del valor crudo.
   */
  isOverdue: boolean
}

export async function clientDeals(clientId: string): Promise<ClientDealDTO[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db
    .select({ id: deal.id, name: deal.name, amount: deal.amount, currency: deal.currency, stageId: deal.stageId, createdAt: deal.createdAt })
    .from(deal)
    .where(and(inArray(deal.id, ids), eq(deal.archived, false)))
}

export async function clientDeliverables(clientId: string, query: ListQuery): Promise<Paginated<DeliverableRow>> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(deliverable)
    .where(
      and(
        inArray(deliverable.dealId, ids),
        eq(deliverable.visibleToClient, true),
        eq(deliverable.archived, false),
        cursor ? cursorWhere(deliverable.createdAt, deliverable.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(deliverable.createdAt), desc(deliverable.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit)
}

async function assertClientDeliverable(
  clientId: string,
  deliverableId: string,
): Promise<DeliverableRow & { portalId: string }> {
  const ids = await clientDealIds(clientId)
  const [dv] = await db.select().from(deliverable).where(eq(deliverable.id, deliverableId)).limit(1)
  // El chequeo de visibilidad va acá y no solo en el listado: sin esto, un
  // cliente que conociera el id podría aprobar o rechazar un entregable interno
  // aunque nunca lo viera en su Portal. Se responde 404 (no 403) para no
  // confirmar que el entregable existe.
  if (!dv || !ids.includes(dv.dealId) || !dv.visibleToClient || dv.archived) {
    throw Errors.notFound('Entregable no encontrado')
  }
  // `deliverable` no guarda portalId: cuelga del deal. Se resuelve acá para que
  // los callers no tengan que repetir el lookup.
  const [d] = await db.select({ portalId: deal.portalId }).from(deal).where(eq(deal.id, dv.dealId)).limit(1)
  if (!d) throw Errors.notFound('Entregable no encontrado')
  return { ...dv, portalId: d.portalId }
}

export async function approveDeliverable(clientId: string, deliverableId: string): Promise<void> {
  const dv = await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'approved', reviewedBy: clientId, reviewedAt: new Date(), feedback: null })
    .where(eq(deliverable.id, deliverableId))

  // Después del UPDATE y sin await bloqueante sobre el resultado: notify nunca
  // lanza, así que la aprobación no puede fallar por un problema de avisos.
  await notifyAdmins(dv.portalId, 'deliverable_approved', { dealId: dv.dealId, deliverableTitle: dv.title }, {
    entity: { type: 'deliverable', id: deliverableId },
    dedupeKey: `deliverable_approved:${deliverableId}`,
  })
}

export async function requestChanges(clientId: string, deliverableId: string, feedback: string): Promise<void> {
  const dv = await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'changes_requested', reviewedBy: clientId, reviewedAt: new Date(), feedback })
    .where(eq(deliverable.id, deliverableId))

  // Sin dedupeKey a propósito: el cliente puede pedir cambios varias veces
  // sobre el mismo entregable (segunda vuelta de revisión) y cada pedido es un
  // evento nuevo que el equipo tiene que ver.
  await notifyAdmins(dv.portalId, 'deliverable_changes_requested', { dealId: dv.dealId, deliverableTitle: dv.title }, {
    entity: { type: 'deliverable', id: deliverableId },
  })
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listClientInvoices(clientId: string, query: ListQuery): Promise<Paginated<ClientInvoiceDTO>> {
  const dealIds = await clientDealIds(clientId)
  if (dealIds.length === 0) return { items: [], nextCursor: null }

  // Fetch invoices for the client's deals (non-archived)
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(invoice)
    .where(
      and(
        inArray(invoice.dealId, dealIds),
        eq(invoice.archived, false),
        cursor ? cursorWhere(invoice.createdAt, invoice.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(invoice.createdAt), desc(invoice.id))
    .limit(query.limit + 1)
  const { items: invoices, nextCursor } = paginateRows(rows, query.limit)

  if (invoices.length === 0) return { items: [], nextCursor }

  // Aggregate payments per invoice in a single query — no N+1. Se suma
  // `amountBase` (USD), NO `amount`: `invoice.currency` y `payment.currency`
  // son independientes (una factura ARS puede cobrarse con un pago USD), así
  // que sumar montos crudos mezclaba unidades distintas bajo el mismo total —
  // el mismo motivo por el que el admin (finance/invoices.ts) balancea todo
  // en amountBase.
  const invoiceIds = invoices.map((inv) => inv.id)
  const paymentTotals = await db
    .select({
      invoiceId: payment.invoiceId,
      paidBase: sql<string>`COALESCE(SUM(${payment.amountBase}), '0')`,
    })
    .from(payment)
    .where(inArray(payment.invoiceId, invoiceIds))
    .groupBy(payment.invoiceId)

  const paidBaseByInvoice = new Map<string, number>(
    paymentTotals.map((r) => [r.invoiceId, Number(r.paidBase)]),
  )

  const items = invoices.map((inv) => {
    const totalPaidBase = paidBaseByInvoice.get(inv.id) ?? 0
    // Balance real en USD (misma unidad que `amountBase`), usado para
    // `isOverdue` — currency-agnostic: solo importa si es > 0, no en qué
    // moneda está expresado.
    const balanceBase = Math.max(0, Number(inv.amountBase) - totalPaidBase)
    // El campo `balance` que ve el cliente se muestra en la MONEDA de la
    // factura (el front lo formatea con `formatCurrency(invoice.balance,
    // invoice.currency)` — mostrar un número en USD bajo un símbolo ARS, o
    // viceversa, sería incorrecto). `calcAmountBase` define
    // amountBase = amount / exchangeRate (ARS por USD) para ARS, así que la
    // conversión inversa es amountBase * exchangeRate. Se guarda contra un TC
    // inválido (0, negativo o no numérico) con fallback a 1 — no debería
    // pasar (createInvoice siempre persiste un TC > 0), pero un balance mal
    // convertido es peor que uno en USD. Si el balance en USD es exactamente
    // 0, se fija "0.00" directo: multiplicar 0 por el TC nunca debería dar
    // otra cosa, pero así queda explícito que no hay margen de redondeo.
    const rate = inv.currency === 'USD' ? 1 : Number(inv.exchangeRate) > 0 ? Number(inv.exchangeRate) : 1
    const balance = balanceBase === 0 ? '0.00' : (balanceBase * rate).toFixed(2)
    return {
      id: inv.id,
      number: inv.number,
      total: inv.total,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issueDate ?? null,
      dueDate: inv.dueDate ?? null,
      balance,
      isOverdue: isInvoiceOverdue(inv, balanceBase),
    }
  })
  return { items, nextCursor }
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
