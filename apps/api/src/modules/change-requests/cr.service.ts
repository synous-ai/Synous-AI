import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  changeRequest,
  changeRequestItem,
  changeRequestComment,
  changeRequestHistory,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import { clientDealIds, assertDealInPortal } from '../../lib/portal-access'
import { createNotification } from '../notifications/notifications.service'
import type { CreateCRDTO, UpdateCRDTO, AddItemDTO } from './cr.schema'

type CRRow = typeof changeRequest.$inferSelect

async function getCRInPortal(portalId: string, id: string): Promise<CRRow> {
  const [cr] = await db
    .select()
    .from(changeRequest)
    .where(and(eq(changeRequest.id, id), eq(changeRequest.portalId, portalId)))
    .limit(1)
  if (!cr) throw Errors.notFound('Change request no encontrada')
  return cr
}

// ── Admin ───────────────────────────────────────────────
export async function listCRs(portalId: string, dealId?: string): Promise<CRRow[]> {
  return db
    .select()
    .from(changeRequest)
    .where(dealId ? and(eq(changeRequest.portalId, portalId), eq(changeRequest.dealId, dealId)) : eq(changeRequest.portalId, portalId))
    .orderBy(desc(changeRequest.createdAt))
}

export async function getCRDetail(portalId: string, id: string) {
  const cr = await getCRInPortal(portalId, id)
  const items = await db.select().from(changeRequestItem).where(eq(changeRequestItem.changeRequestId, id))
  const comments = await db
    .select()
    .from(changeRequestComment)
    .where(eq(changeRequestComment.changeRequestId, id))
    .orderBy(asc(changeRequestComment.createdAt))
  const history = await db
    .select()
    .from(changeRequestHistory)
    .where(eq(changeRequestHistory.changeRequestId, id))
    .orderBy(desc(changeRequestHistory.changedAt))
  return { changeRequest: cr, items, comments, history }
}

export async function createCR(portalId: string, userId: string, input: CreateCRDTO): Promise<CRRow> {
  await assertDealInPortal(portalId, input.dealId)
  return db.transaction(async (tx) => {
    const numRows = await tx
      .select({ next: sql<number>`coalesce(max(${changeRequest.number}), 0) + 1` })
      .from(changeRequest)
      .where(eq(changeRequest.dealId, input.dealId))
    const next = numRows[0]?.next ?? 1
    const [cr] = await tx
      .insert(changeRequest)
      .values({
        portalId,
        dealId: input.dealId,
        number: next,
        title: input.title,
        description: input.description,
        originalScopeRef: input.originalScopeRef,
        origin: input.origin ?? 'agency',
        totalAmount: toDecimal(input.totalAmount),
        timelineImpactDays: input.timelineImpactDays ?? 0,
        createdBy: userId,
      })
      .returning()
    if (!cr) throw Errors.internal('No se pudo crear la CR')
    if (input.items?.length) {
      await tx.insert(changeRequestItem).values(
        input.items.map((it) => ({
          changeRequestId: cr.id,
          description: it.description,
          hours: toDecimal(it.hours),
          unitPrice: it.unitPrice.toFixed(2),
          quantity: (it.quantity ?? 1).toFixed(2),
        })),
      )
    }
    await tx.insert(changeRequestHistory).values({ changeRequestId: cr.id, toStatus: 'draft', changedByUser: userId })
    return cr
  })
}

export async function updateCR(portalId: string, id: string, input: UpdateCRDTO): Promise<CRRow> {
  const cr = await getCRInPortal(portalId, id)
  if (cr.status !== 'draft') throw Errors.badRequest('Solo se puede editar una CR en borrador')
  const [row] = await db
    .update(changeRequest)
    .set({ ...input, totalAmount: toDecimal(input.totalAmount), updatedAt: new Date() })
    .where(eq(changeRequest.id, id))
    .returning()
  return row!
}

export async function addItem(portalId: string, id: string, input: AddItemDTO) {
  const cr = await getCRInPortal(portalId, id)
  if (cr.status !== 'draft') throw Errors.badRequest('Solo se editan ítems en borrador')
  const [row] = await db
    .insert(changeRequestItem)
    .values({
      changeRequestId: id,
      description: input.description,
      hours: toDecimal(input.hours),
      unitPrice: input.unitPrice.toFixed(2),
      quantity: (input.quantity ?? 1).toFixed(2),
    })
    .returning()
  return row!
}

export async function deleteItem(portalId: string, id: string, itemId: string): Promise<void> {
  await getCRInPortal(portalId, id)
  await db.delete(changeRequestItem).where(and(eq(changeRequestItem.id, itemId), eq(changeRequestItem.changeRequestId, id)))
}

/** Transición de estado del lado admin (incl. send). Registra historial. */
export async function transitionCR(portalId: string, userId: string, id: string, status: string, comment?: string): Promise<CRRow> {
  const cr = await getCRInPortal(portalId, id)
  const patch: Partial<typeof changeRequest.$inferInsert> = { status, updatedAt: new Date() }
  if (status === 'completed') patch.completedAt = new Date()
  const [row] = await db.update(changeRequest).set(patch).where(eq(changeRequest.id, id)).returning()
  await db.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: status, comment, changedByUser: userId })
  return row!
}

export async function addComment(portalId: string, userId: string, id: string, body: string) {
  await getCRInPortal(portalId, id)
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorUser: userId }).returning()
  return row!
}

// ── Cliente ─────────────────────────────────────────────
async function getClientCR(clientId: string, id: string): Promise<CRRow> {
  const ids = await clientDealIds(clientId)
  const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, id)).limit(1)
  if (!cr || !ids.includes(cr.dealId)) throw Errors.notFound('Change request no encontrada')
  return cr
}

export async function clientListCRs(clientId: string): Promise<CRRow[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db
    .select()
    .from(changeRequest)
    .where(and(inArray(changeRequest.dealId, ids), ne(changeRequest.status, 'draft')))
    .orderBy(desc(changeRequest.createdAt))
}

export async function clientDecision(clientId: string, id: string, decision: 'approved' | 'rejected', comment?: string): Promise<void> {
  const cr = await getClientCR(clientId, id)
  await db
    .update(changeRequest)
    .set({
      status: decision,
      updatedAt: new Date(),
      ...(decision === 'approved' ? { approvedAt: new Date(), approvedBy: clientId } : {}),
    })
    .where(eq(changeRequest.id, id))
  await db.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: decision, comment, changedByClient: clientId })
  await createNotification({
    portalId: cr.portalId,
    entityType: 'change_request',
    entityId: id,
    type: decision === 'approved' ? 'cr_approved' : 'cr_rejected',
    title: `El cliente ${decision === 'approved' ? 'aprobó' : 'rechazó'} la CR #${cr.number}`,
  })
}

export async function clientComment(clientId: string, id: string, body: string) {
  await getClientCR(clientId, id)
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorClient: clientId }).returning()
  return row!
}
