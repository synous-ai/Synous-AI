import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import {
  changeRequest,
  changeRequestItem,
  changeRequestComment,
  changeRequestHistory,
  deal,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import { clientDealIds, assertDealInPortal } from '../../lib/portal-access'
import { notifyAdmins, notifyDealClients } from '../notifications/notify'
import type { CreateCRDTO, UpdateCRDTO, AddItemDTO, CRListQuery } from './cr.schema'

type CRRow = typeof changeRequest.$inferSelect

/**
 * Transiciones que el equipo puede aplicar desde cada estado. Es la misma
 * matriz que ofrece la UI del admin (change-requests/[id]/page.tsx): el enum de
 * Zod solo valida que el estado exista, no que el salto sea legal, y sin esto
 * una CR completada podía volver a borrador con una llamada directa a la API.
 */
const ADMIN_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent'],
  sent: ['approved', 'approved_verbally', 'negotiating', 'disputed', 'rejected'],
  negotiating: ['approved', 'approved_verbally', 'disputed', 'rejected', 'sent'],
  approved_verbally: ['approved', 'completed'],
  approved: ['completed'],
  disputed: ['negotiating', 'rejected'],
  rejected: [],
  completed: [],
}

/** Estados en los que la CR espera la decisión del cliente (WAITING_CLIENT en la UI). */
const CLIENT_DECIDABLE_STATUSES: readonly string[] = ['sent', 'negotiating']

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

/**
 * CR + el nombre de su deal. Sin `dealId` el listado es global (cola de trabajo
 * de todas las CRs del portal), y ahí saber a qué deal pertenece cada una es
 * imprescindible. `dealName` se agrega SIN quitar ninguna columna de la tabla,
 * así los consumidores que ya existían siguen viendo lo mismo.
 */
export type CRListRow = CRRow & { dealName: string | null }

export async function listCRs(portalId: string, query: CRListQuery): Promise<Paginated<CRListRow>> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select({ ...getTableColumns(changeRequest), dealName: deal.name })
    .from(changeRequest)
    .leftJoin(deal, eq(deal.id, changeRequest.dealId))
    .where(
      and(
        eq(changeRequest.portalId, portalId),
        query.dealId ? eq(changeRequest.dealId, query.dealId) : undefined,
        cursor ? cursorWhere(changeRequest.createdAt, changeRequest.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(changeRequest.createdAt), desc(changeRequest.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit)
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
    // MAX+1 bajo READ COMMITTED no ve las inserciones en curso de otras
    // transacciones: dos creates simultáneos en el mismo deal calculaban el
    // mismo número y el segundo rompía el UNIQUE(deal_id, number). El lock por
    // deal los serializa sin bloquear CRs de otros deals.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`change-request-number:${input.dealId}`}))`)
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
  if (!ADMIN_TRANSITIONS[cr.status]?.includes(status)) {
    throw Errors.conflict(`No se puede pasar una change request de "${cr.status}" a "${status}"`)
  }
  const patch: Partial<typeof changeRequest.$inferInsert> = { status, updatedAt: new Date() }
  if (status === 'completed') patch.completedAt = new Date()
  const row = await db.transaction(async (tx) => {
    // Condicionado al estado leído: dos transiciones concurrentes no pueden
    // aplicarse las dos sobre el mismo estado de origen.
    const [updated] = await tx
      .update(changeRequest)
      .set(patch)
      .where(and(eq(changeRequest.id, id), eq(changeRequest.status, cr.status)))
      .returning()
    if (!updated) throw Errors.conflict('La change request cambió de estado mientras tanto. Recargá e intentá de nuevo.')
    await tx.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: status, comment, changedByUser: userId })
    return updated
  })

  // Al pasar a 'sent' la pelota queda del lado del cliente: necesita decidir.
  if (status === 'sent' && cr.status !== 'sent') {
    await notifyDealClients(portalId, cr.dealId, 'cr_sent', {
      crId: id,
      crNumber: cr.number,
      title: cr.title,
    }, { entity: { type: 'change_request', id }, dedupeKey: `cr_sent:${id}` })
  }
  return row
}

export async function addComment(portalId: string, userId: string, id: string, body: string) {
  const cr = await getCRInPortal(portalId, id)
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorUser: userId }).returning()

  // Sin dedupeKey: cada comentario es un evento propio; deduplicarlos por CR
  // silenciaría toda la conversación después del primero.
  await notifyDealClients(portalId, cr.dealId, 'cr_commented', { crId: id, crNumber: cr.number }, {
    entity: { type: 'change_request', id },
  })
  return row!
}

// ── Cliente ─────────────────────────────────────────────
async function getClientCR(clientId: string, id: string): Promise<CRRow> {
  const ids = await clientDealIds(clientId)
  const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, id)).limit(1)
  // Un borrador no existe para el cliente (el listado ya lo oculta): 404 y no
  // 403, para no confirmar que la CR existe.
  if (!cr || !ids.includes(cr.dealId) || cr.status === 'draft') throw Errors.notFound('Change request no encontrada')
  return cr
}

export async function clientListCRs(clientId: string, query: ListQuery): Promise<Paginated<CRRow>> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(changeRequest)
    .where(
      and(
        inArray(changeRequest.dealId, ids),
        ne(changeRequest.status, 'draft'),
        cursor ? cursorWhere(changeRequest.createdAt, changeRequest.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(changeRequest.createdAt), desc(changeRequest.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit)
}

export async function clientDecision(clientId: string, id: string, decision: 'approved' | 'rejected', comment?: string): Promise<void> {
  const cr = await getClientCR(clientId, id)
  // La aprobación del cliente fija alcance y precio: solo vale sobre una CR que
  // el equipo le envió y que todavía espera respuesta, nunca para re-decidir.
  if (!CLIENT_DECIDABLE_STATUSES.includes(cr.status)) {
    throw Errors.conflict('Esta change request no está esperando tu decisión')
  }
  const applied = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(changeRequest)
      .set({
        status: decision,
        updatedAt: new Date(),
        ...(decision === 'approved' ? { approvedAt: new Date(), approvedBy: clientId } : {}),
      })
      .where(and(eq(changeRequest.id, id), eq(changeRequest.status, cr.status)))
      .returning({ id: changeRequest.id })
    if (!row) return false
    await tx.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: decision, comment, changedByClient: clientId })
    return true
  })
  if (!applied) throw Errors.conflict('Esta change request no está esperando tu decisión')
  // Antes esto llamaba a createNotification SIN userId ni clientId: la fila
  // quedaba sin destinatario y ninguna query de listado la devolvía nunca — el
  // equipo no se enteraba de la decisión del cliente. Era una de las fuentes de
  // las filas huérfanas que destapó el check de la migración 0037.
  await notifyAdmins(
    cr.portalId,
    decision === 'approved' ? 'cr_approved' : 'cr_rejected',
    { crId: id, crNumber: cr.number, dealName: cr.title },
    { entity: { type: 'change_request', id }, dedupeKey: `cr_${decision}:${id}` },
  )
}

export async function clientComment(clientId: string, id: string, body: string) {
  await getClientCR(clientId, id)
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorClient: clientId }).returning()
  return row!
}
