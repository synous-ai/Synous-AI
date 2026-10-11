import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from 'drizzle-orm'
import {
  ADMIN_TRANSITIONS,
  adminBucketFor,
  type ChangeRequestStatus,
  type CREventType,
} from '@synous/shared'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { changeRequest, changeRequestComment, changeRequestItem, deal } from '../../db/schema'
import { writeAudit } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import { assertDealInPortal } from '../../lib/portal-access'
import { notifyDealClients } from '../notifications/notify'
import type { StorageActor } from '../uploads/uploads.types'
import { attachCRUploads, prepareCRUploads } from './cr-attachments'
import { bucketIndex } from './cr-buckets'
import { loadCRDetail, type CRDetail, type CRRow } from './cr-detail'
import { decideProposal } from './cr-proposal-decision'
import { recordCREvent } from './cr-events'
import type { AddItemDTO, AttachmentsDTO, CommentDTO, CRListQuery, CRSummaryQuery, CreateCRDTO, UpdateCRDTO } from './cr.schema'

export type { CRRow }

export const ADMIN_BUCKET_STATUSES = bucketIndex(adminBucketFor)

/** Evento que mejor describe cada destino; el resto son cambios de estado genéricos. */
const EVENT_BY_STATUS: Partial<Record<ChangeRequestStatus, CREventType>> = {
  under_review: 'review_started',
  rejected: 'rejected',
  cancelled: 'cancelled',
  completed: 'completed',
}

export async function getCRInPortal(portalId: string, id: string): Promise<CRRow> {
  const [cr] = await db
    .select()
    .from(changeRequest)
    .where(and(eq(changeRequest.id, id), eq(changeRequest.portalId, portalId)))
    .limit(1)
  if (!cr) throw Errors.notFound('Change request no encontrada')
  return cr
}

function hubActor(portalId: string, userId: string): StorageActor {
  return { kind: 'hub', userId, portalId }
}

// ── Listado y contadores ────────────────────────────────────────────────────

/**
 * CR + el nombre de su deal. Sin `dealId` el listado es global (cola de trabajo
 * de todas las CRs del portal), y ahí saber a qué deal pertenece cada una es
 * imprescindible. `dealName` se agrega SIN quitar ninguna columna de la tabla,
 * así los consumidores que ya existían siguen viendo lo mismo.
 */
export type CRListRow = CRRow & { dealName: string | null }

export async function listCRs(portalId: string, query: CRListQuery): Promise<Paginated<CRListRow>> {
  const cursor = decodeCursor(query.cursor)
  const statuses = query.status ?? (query.bucket ? ADMIN_BUCKET_STATUSES[query.bucket] : undefined)
  const rows = await db
    .select({ ...getTableColumns(changeRequest), dealName: deal.name })
    .from(changeRequest)
    .leftJoin(deal, eq(deal.id, changeRequest.dealId))
    .where(
      and(
        eq(changeRequest.portalId, portalId),
        query.dealId ? eq(changeRequest.dealId, query.dealId) : undefined,
        statuses ? inArray(changeRequest.status, statuses) : undefined,
        query.origin ? eq(changeRequest.origin, query.origin) : undefined,
        query.q ? searchFilter(query.q) : undefined,
        cursor ? cursorWhere(changeRequest.createdAt, changeRequest.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(changeRequest.createdAt), desc(changeRequest.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit)
}

/** `%` y `_` son comodines de LIKE: sin escaparlos, un `q` con `%` devuelve todo. */
function searchFilter(q: string) {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return or(ilike(changeRequest.title, pattern), ilike(changeRequest.description, pattern))
}

export interface CRSummary {
  all: number
  needs_action: number
  in_review: number
  resolved: number
}

/** Contadores por bucket, resueltos en UNA query — no sobre la página traída. */
export async function summarizeCRs(portalId: string, query: CRSummaryQuery): Promise<CRSummary> {
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      needs_action: sql<number>`count(*) filter (where ${inArray(changeRequest.status, ADMIN_BUCKET_STATUSES.needs_action)})::int`,
      in_review: sql<number>`count(*) filter (where ${inArray(changeRequest.status, ADMIN_BUCKET_STATUSES.in_review)})::int`,
      resolved: sql<number>`count(*) filter (where ${inArray(changeRequest.status, ADMIN_BUCKET_STATUSES.resolved)})::int`,
    })
    .from(changeRequest)
    .where(and(eq(changeRequest.portalId, portalId), query.dealId ? eq(changeRequest.dealId, query.dealId) : undefined))
  return row ?? { all: 0, needs_action: 0, in_review: 0, resolved: 0 }
}

export async function getCRDetail(portalId: string, id: string): Promise<CRDetail> {
  const cr = await getCRInPortal(portalId, id)
  return loadCRDetail(cr)
}

// ── Alta y edición ──────────────────────────────────────────────────────────

export async function createCR(portalId: string, userId: string, input: CreateCRDTO): Promise<CRRow> {
  await assertDealInPortal(portalId, input.dealId)
  return db.transaction(async (tx) => {
    const next = await nextCRNumber(tx, input.dealId)
    const [cr] = await tx
      .insert(changeRequest)
      .values({
        portalId,
        dealId: input.dealId,
        number: next,
        title: input.title,
        description: input.description,
        context: input.context ?? null,
        originalScopeRef: input.originalScopeRef,
        origin: input.origin ?? 'agency',
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
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
    await recordCREvent(tx, { changeRequestId: cr.id, eventType: 'created', actorRole: 'admin', toStatus: 'draft', userId })
    return cr
  })
}

/**
 * Siguiente número DENTRO del deal, serializado con un advisory lock.
 *
 * MAX+1 bajo READ COMMITTED no ve las inserciones en curso de otras
 * transacciones: dos creates simultáneos en el mismo deal calculaban el mismo
 * número y el segundo rompía el UNIQUE(deal_id, number). El lock por deal los
 * serializa sin bloquear CRs de otros deals.
 */
export async function nextCRNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], dealId: string): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`change-request-number:${dealId}`}))`)
  const rows = await tx
    .select({ next: sql<number>`coalesce(max(${changeRequest.number}), 0) + 1` })
    .from(changeRequest)
    .where(eq(changeRequest.dealId, dealId))
  return rows[0]?.next ?? 1
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

/**
 * Ítem a nivel CR (el "presupuesto" del borrador). `proposalId` queda SIEMPRE
 * en null: los ítems de una propuesta se crean con la propuesta y son parte de
 * su snapshot inmutable — se reemplazan entero desde `updateProposal`, nunca de
 * a uno por esta puerta.
 */
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

/**
 * Borra un ítem a nivel CR. DOS guardas, no una:
 *
 * 1. `status === 'draft'` — igual que `addItem` y `updateCR`. Sin esto se podía
 *    editar el presupuesto de una CR ya enviada.
 * 2. `proposalId IS NULL` — los ítems de una propuesta llevan también
 *    `changeRequestId`, así que caían dentro del WHERE: se podía borrar un ítem
 *    de la propuesta v1 que el cliente YA había aceptado y el snapshot que él
 *    aprobó cambiaba retroactivamente, sin dejar rastro en el historial.
 */
export async function deleteItem(portalId: string, id: string, itemId: string): Promise<void> {
  const cr = await getCRInPortal(portalId, id)
  if (cr.status !== 'draft') throw Errors.badRequest('Solo se editan ítems en borrador')
  const [item] = await db
    .select({ id: changeRequestItem.id, proposalId: changeRequestItem.proposalId })
    .from(changeRequestItem)
    .where(and(eq(changeRequestItem.id, itemId), eq(changeRequestItem.changeRequestId, id)))
    .limit(1)
  if (!item) throw Errors.notFound('Ítem no encontrado')
  if (item.proposalId) {
    throw Errors.conflict('Un ítem de una propuesta no se borra suelto: es parte del snapshot que decide el cliente')
  }
  await db.delete(changeRequestItem).where(eq(changeRequestItem.id, itemId))
}

// ── Transiciones ────────────────────────────────────────────────────────────

/** Estados en los que el equipo da por cerrado el acuerdo sobre la propuesta vigente. */
const APPROVAL_STATUSES: readonly ChangeRequestStatus[] = ['approved', 'approved_verbally']

/**
 * Transición de estado del lado admin. Registra evento e historial.
 *
 * `sent` NO se acepta acá. Enviar una propuesta no es "mover un estado": es
 * crear (o sacar del borrador) la versión que el cliente va a decidir. Cuando
 * esta ruta lo permitía, la CR quedaba en `sent` con `currentProposalId` en
 * null: el portal mostraba "Requiere tu decisión" y los tres botones sobre la
 * nada, y si el cliente aprobaba, la CR terminaba `approved` con
 * `approvedProposalId` en null y el evento con la metadata vacía.
 *
 * El bloqueo va ACÁ y no en `ADMIN_TRANSITIONS`: `sent` SÍ es un destino legal
 * del dominio (lo usan `createProposal` y `sendProposal`), lo ilegal es llegar
 * a él por la ruta genérica. Y va DESPUÉS de `getCRInPortal` para no contestar
 * distinto a un admin de otro portal (sigue siendo 404, no 400).
 */
export async function transitionCR(
  portalId: string,
  userId: string,
  id: string,
  status: ChangeRequestStatus,
  comment?: string,
): Promise<CRRow> {
  const cr = await getCRInPortal(portalId, id)
  if (status === 'sent') {
    throw Errors.badRequest(
      'Para enviarle una propuesta al cliente usá POST /api/change-requests/:id/proposals (o .../proposals/:proposalId/send si ya la guardaste como borrador)',
    )
  }
  assertAdminTransition(cr.status, status)

  const now = new Date()
  const patch: Partial<typeof changeRequest.$inferInsert> = { status, updatedAt: now }
  if (status === 'under_review' && !cr.reviewStartedAt) patch.reviewStartedAt = now
  if (status === 'rejected') patch.rejectedAt = now
  if (status === 'cancelled') patch.cancelledAt = now
  if (status === 'completed') patch.completedAt = now
  // El equipo también puede dar por aprobada una CR (acuerdo fuera del portal):
  // sin sellar la fecha, el detalle muestra "Aprobada" sin cuándo. `approvedBy`
  // queda en null a propósito: es FK a client_account, no hay cliente que firme.
  const isApproval = APPROVAL_STATUSES.includes(status)
  if (isApproval && !cr.approvedAt) patch.approvedAt = now
  // Se fija SOBRE QUÉ se aprobó. Antes el patch escribía solo el estado: la CR
  // quedaba "aprobada" sin saber qué números, y la propuesta vigente colgada en
  // `sent` para siempre — se perdía exactamente el dato que justifica la tabla
  // `change_request_proposal`.
  if (isApproval && cr.currentProposalId) patch.approvedProposalId = cr.currentProposalId

  const row = await db.transaction(async (tx) => {
    // El snapshot se toma DENTRO de la transacción y antes del UPDATE de la CR:
    // si algo falla, no queda una propuesta marcada `accepted` sobre una CR que
    // nunca se aprobó.
    const snapshot = isApproval ? await decideProposal(tx, cr.currentProposalId, 'accepted', null) : {}

    // Condicionado al estado leído: dos transiciones concurrentes no pueden
    // aplicarse las dos sobre el mismo estado de origen.
    const [updated] = await tx
      .update(changeRequest)
      .set(patch)
      .where(and(eq(changeRequest.id, id), eq(changeRequest.status, cr.status)))
      .returning()
    if (!updated) throw Errors.conflict('La change request cambió de estado mientras tanto. Recargá e intentá de nuevo.')
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: EVENT_BY_STATUS[status] ?? 'status_changed',
      actorRole: 'admin',
      fromStatus: cr.status,
      toStatus: status,
      comment,
      userId,
      // Aprobar sin propuesta vigente es LEGAL (el equipo puede cerrar una CR
      // que nunca se formalizó en el portal), pero el historial tiene que
      // decirlo: `noProposal` es la constancia de que no había números que
      // congelar, para que nadie lea ese `approvedProposalId` null como un bug.
      metadata: isApproval ? { ...snapshot, ...(cr.currentProposalId ? {} : { noProposal: true }) } : undefined,
    })
    if (status === 'cancelled' || status === 'completed' || status === 'rejected') {
      await writeAudit({ tx, portalId, userId, entityType: 'change_request', entityId: id, action: `CR_${status.toUpperCase()}`, payload: { from: cr.status } })
    }
    if (isApproval) {
      await writeAudit({ tx, portalId, userId, entityType: 'change_request', entityId: id, action: 'CR_APPROVED_BY_ADMIN', payload: snapshot })
    }
    return updated
  })

  await notifyTransition(cr, status)
  return row
}

/**
 * El enum de Zod sólo garantiza que el estado exista, no que el salto sea
 * legal: sin esta validación una CR completada volvía a borrador con una
 * llamada directa a la API. La matriz vive en `@synous/shared` — es la MISMA
 * que consume la UI, así que no pueden divergir.
 */
export function assertAdminTransition(from: string, to: ChangeRequestStatus): void {
  const allowed: readonly string[] = ADMIN_TRANSITIONS[from as ChangeRequestStatus] ?? []
  if (!allowed.includes(to)) {
    throw Errors.conflict(`No se puede pasar una change request de "${from}" a "${to}"`)
  }
}

/**
 * `sent` no aparece acá: por esta ruta ya no se llega (ver `transitionCR`). El
 * aviso al cliente de "tenés una propuesta para decidir" lo emite el envío de
 * la propuesta, que es el único que sabe qué versión salió.
 */
async function notifyTransition(cr: CRRow, status: ChangeRequestStatus): Promise<void> {
  if (status === cr.status) return
  const payload = { crId: cr.id, crNumber: cr.number, title: cr.title }
  const entity = { type: 'change_request', id: cr.id }
  if (status === 'cancelled') {
    await notifyDealClients(cr.portalId, cr.dealId, 'cr_cancelled', payload, { entity, dedupeKey: `cr_cancelled:${cr.id}` })
    return
  }
  if (status === 'completed') {
    await notifyDealClients(cr.portalId, cr.dealId, 'cr_completed', payload, { entity, dedupeKey: `cr_completed:${cr.id}` })
  }
}

// ── Conversación y adjuntos ─────────────────────────────────────────────────

export async function addComment(portalId: string, userId: string, id: string, input: CommentDTO) {
  const cr = await getCRInPortal(portalId, id)
  const actor = hubActor(portalId, userId)
  const prepared = await prepareCRUploads(actor, input.uploads)

  const row = await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(changeRequestComment)
      .values({ changeRequestId: id, body: input.body, authorUser: userId })
      .returning()
    if (!comment) throw Errors.internal('No se pudo guardar el comentario')
    await attachCRUploads(tx, { changeRequestId: id, commentId: comment.id, prepared, actor })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'comment_added',
      actorRole: 'admin',
      userId,
      metadata: { commentId: comment.id, attachments: prepared.length },
    })
    return comment
  })

  // Sin dedupeKey: cada comentario es un evento propio; deduplicarlos por CR
  // silenciaría toda la conversación después del primero.
  await notifyDealClients(portalId, cr.dealId, 'cr_commented', { crId: id, crNumber: cr.number }, {
    entity: { type: 'change_request', id },
  })
  return row
}

export async function addAttachments(portalId: string, userId: string, id: string, input: AttachmentsDTO): Promise<{ attached: number }> {
  const cr = await getCRInPortal(portalId, id)
  const actor = hubActor(portalId, userId)
  const prepared = await prepareCRUploads(actor, input.uploads)

  const attached = await db.transaction(async (tx) => {
    const names = await attachCRUploads(tx, { changeRequestId: id, prepared, actor })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'attachment_added',
      actorRole: 'admin',
      userId,
      metadata: { names },
    })
    return names.length
  })

  // Un borrador es interno: avisarle al cliente de un archivo en una CR que su
  // portal ni siquiera lista sería mandarlo a una pantalla vacía.
  if (attached > 0 && cr.status !== 'draft') {
    // Sin dedupeKey, mismo criterio que los comentarios: cada subida es un
    // hecho propio y deduplicar por CR silenciaría todas menos la primera.
    await notifyDealClients(portalId, cr.dealId, 'cr_attachment_added', { crId: id, crNumber: cr.number, count: attached }, {
      entity: { type: 'change_request', id },
    })
  }
  return { attached }
}
