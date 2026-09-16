import { and, desc, eq, getTableColumns, inArray, ne, sql } from 'drizzle-orm'
import {
  CLIENT_TRANSITIONS,
  clientBucketFor,
  type ChangeRequestClientAction,
  type ChangeRequestStatus,
} from '@synous/shared'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { changeRequest, changeRequestComment, deal } from '../../db/schema'
import { writeAudit } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { assertDealInPortal, clientDealIds, resolveActiveClientDeal } from '../../lib/portal-access'
import { notifyAdmins } from '../notifications/notify'
import type { StorageActor } from '../uploads/uploads.types'
import { attachCRUploads, prepareCRUploads } from './cr-attachments'
import { bucketIndex } from './cr-buckets'
import { loadClientCRDetail, toClientCR, type ClientCRDetail, type ClientChangeRequestDTO, type CRRow } from './cr-detail'
import { recordCREvent, resolveActorNames, actorOf } from './cr-events'
import { decideProposal } from './cr-proposal-decision'
import { nextCRNumber } from './cr.service'
import type {
  ClientAdjustmentDTO,
  ClientCancelDTO,
  ClientCommentDTO,
  ClientCreateCRDTO,
  ClientListQuery,
  ClientApproveDTO,
  ClientRejectDTO,
} from './cr.schema'

/** Quién llama: siempre la sesión ya verificada, nunca un id que venga del body. */
export interface ClientCaller {
  clientId: string
  portalId: string
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** `draft` queda fuera de todos los buckets: para el cliente esa CR no existe. */
export const CLIENT_BUCKET_STATUSES = bucketIndex(clientBucketFor, { excludeDraft: true })

function clientActor(caller: ClientCaller): StorageActor {
  return { kind: 'client', clientId: caller.clientId, portalId: caller.portalId }
}

/**
 * Resuelve la CR SIEMPRE por los deals del cliente. Un borrador no existe para
 * él (el listado ya lo oculta): 404 y no 403, para no confirmar que la CR
 * existe. Mismo criterio para una CR de otro cliente.
 */
async function getClientCR(clientId: string, id: string): Promise<CRRow> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) throw Errors.notFound('Change request no encontrada')
  const [cr] = await db
    .select()
    .from(changeRequest)
    .where(and(eq(changeRequest.id, id), inArray(changeRequest.dealId, ids), ne(changeRequest.status, 'draft')))
    .limit(1)
  if (!cr) throw Errors.notFound('Change request no encontrada')
  return cr
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Listado del portal.
 *
 * Devuelve el MISMO DTO recortado que el detalle (`toClientCR`): proyección
 * explícita sin ids internos, más `dealName`, `requestedByName` y `canCancel`.
 * Antes era un `select()` pelado: el portal declaraba esos tres campos y
 * renderizaba "Solicitado por" vacío en TODAS las cards, y ofrecía "Cancelar"
 * en solicitudes que había abierto el equipo (403 al hacer click).
 */
export async function clientListCRs(clientId: string, query: ClientListQuery): Promise<Paginated<ClientChangeRequestDTO>> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)
  const statuses = (query.status ?? (query.bucket ? CLIENT_BUCKET_STATUSES[query.bucket] : undefined))?.filter(
    (s) => s !== 'draft',
  )
  // El nombre del deal sale del mismo JOIN que el listado del admin: una query,
  // no una por fila.
  const rows = await db
    .select({ ...getTableColumns(changeRequest), dealName: deal.name })
    .from(changeRequest)
    .leftJoin(deal, eq(deal.id, changeRequest.dealId))
    .where(
      and(
        inArray(changeRequest.dealId, ids),
        // Nunca 'draft', pida lo que pida el filtro.
        ne(changeRequest.status, 'draft'),
        statuses ? inArray(changeRequest.status, statuses.length > 0 ? statuses : ['draft']) : undefined,
        cursor ? cursorWhere(changeRequest.createdAt, changeRequest.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(changeRequest.createdAt), desc(changeRequest.id))
    .limit(query.limit + 1)

  const { items, nextCursor } = paginateRows(rows, query.limit)
  // Nombres de TODOS los autores de la página en DOS queries (`resolveActorNames`),
  // no una por card.
  const names = await resolveActorNames(
    items.map((r) => r.createdBy),
    items.map((r) => r.createdByClient),
  )
  return {
    items: items.map(({ dealName, ...cr }) =>
      toClientCR(cr, dealName, actorOf(names, cr.createdBy, cr.createdByClient).name, clientId),
    ),
    nextCursor,
  }
}

export interface CRSummary {
  all: number
  needs_action: number
  in_review: number
  resolved: number
}

export async function clientSummarizeCRs(clientId: string): Promise<CRSummary> {
  const empty: CRSummary = { all: 0, needs_action: 0, in_review: 0, resolved: 0 }
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return empty
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      needs_action: sql<number>`count(*) filter (where ${inArray(changeRequest.status, CLIENT_BUCKET_STATUSES.needs_action)})::int`,
      in_review: sql<number>`count(*) filter (where ${inArray(changeRequest.status, CLIENT_BUCKET_STATUSES.in_review)})::int`,
      resolved: sql<number>`count(*) filter (where ${inArray(changeRequest.status, CLIENT_BUCKET_STATUSES.resolved)})::int`,
    })
    .from(changeRequest)
    .where(and(inArray(changeRequest.dealId, ids), ne(changeRequest.status, 'draft')))
  return row ?? empty
}

export async function clientGetCRDetail(clientId: string, id: string): Promise<ClientCRDetail> {
  const cr = await getClientCR(clientId, id)
  return loadClientCRDetail(cr, clientId)
}

// ── Alta desde el portal ────────────────────────────────────────────────────

export interface ClientCreateResult {
  changeRequest: CRRow
  /** `false` cuando el `clientRequestId` ya se había usado: es el mismo pedido, no uno nuevo. */
  created: boolean
}

/**
 * Crea la solicitud del cliente.
 *
 * El deal NO se toma del body a ciegas: si viene, tiene que estar entre los del
 * cliente; si no viene, se resuelve su deal activo. Sin eso, un cliente podía
 * colgar su solicitud del proyecto de otro mandando el id en el body.
 *
 * Precio, plazo y estado no son parámetros: la CR nace en `submitted` y los
 * números los pone el equipo en una propuesta.
 */
export async function clientCreateCR(caller: ClientCaller, input: ClientCreateCRDTO): Promise<ClientCreateResult> {
  const { id: dealId, name: dealName } = await resolveTargetDeal(caller, input.dealId)

  if (input.clientRequestId) {
    const existing = await findByClientRequestId(dealId, input.clientRequestId)
    if (existing) return { changeRequest: existing, created: false }
  }

  const actor = clientActor(caller)
  const prepared = await prepareCRUploads(actor, input.uploads)
  const now = new Date()

  let cr: CRRow
  try {
    cr = await db.transaction(async (tx) => {
      const next = await nextCRNumber(tx, dealId)
      const [row] = await tx
        .insert(changeRequest)
        .values({
          portalId: caller.portalId,
          dealId,
          number: next,
          title: input.title,
          description: input.description,
          context: input.context ?? null,
          ...(input.priority ? { priority: input.priority } : {}),
          origin: 'client',
          status: 'submitted',
          submittedAt: now,
          createdByClient: caller.clientId,
          clientRequestId: input.clientRequestId ?? null,
        })
        .returning()
      if (!row) throw Errors.internal('No se pudo crear la solicitud')

      await attachCRUploads(tx, { changeRequestId: row.id, prepared, actor })
      await recordCREvent(tx, { changeRequestId: row.id, eventType: 'created', actorRole: 'client', clientId: caller.clientId })
      await recordCREvent(tx, {
        changeRequestId: row.id,
        eventType: 'submitted',
        actorRole: 'client',
        toStatus: 'submitted',
        clientId: caller.clientId,
      })
      await writeAudit({
        tx,
        portalId: caller.portalId,
        clientId: caller.clientId,
        entityType: 'change_request',
        entityId: row.id,
        action: 'CR_SUBMITTED',
        payload: { dealId, number: next },
      })
      return row
    })
  } catch (err) {
    // Dos envíos en paralelo con el mismo clientRequestId: el índice único
    // parcial gana la carrera y acá se devuelve la que sí se creó. El chequeo
    // previo no alcanza — entre el SELECT y el INSERT hay una ventana real.
    //
    // Los `prepareCRUploads` ya ejecutados NO se reclaman a propósito.
    // `prepareUploadClaim` no escribe nada: solo verifica la key contra el
    // store, y la fila de `file_upload` ya existía en `pending` desde que el
    // portal subió el archivo. Reclamarlas acá duplicaría los adjuntos de la CR
    // original en cada reintento — justo lo contrario de lo que promete el
    // `clientRequestId`. Quedan `pending` igual que cualquier subida que el
    // usuario abandona, y la limpieza oportunista de `uploads.service` las
    // borra a las 24 h.
    const existing = input.clientRequestId ? await findByClientRequestId(dealId, input.clientRequestId) : null
    if (!existing) throw err
    return { changeRequest: existing, created: false }
  }

  await notifyAdmins(
    caller.portalId,
    'cr_submitted',
    // `dealName` no es decorativo: el template del evento lo usa
    // (`${title} · ${dealName}`) y mandarlo siempre en null hacía que el equipo
    // viera "Nueva solicitud" sin saber de qué proyecto.
    { crId: cr.id, crNumber: cr.number, title: cr.title, dealName },
    { entity: { type: 'change_request', id: cr.id }, dedupeKey: `cr_submitted:${cr.id}` },
  )
  return { changeRequest: cr, created: true }
}

/** Deal destino (id + nombre) ya validado contra los deals del cliente y su portal. */
async function resolveTargetDeal(caller: ClientCaller, dealId: string | undefined): Promise<{ id: string; name: string }> {
  if (dealId) {
    const ids = await clientDealIds(caller.clientId)
    // Mismo mensaje que `assertDealInPortal`: no distingue "no existe" de "no
    // es tuyo", así no se puede sondear qué deals hay.
    if (!ids.includes(dealId)) throw Errors.badRequest('Deal inexistente')
    const row = await assertDealInPortal(caller.portalId, dealId)
    return { id: row.id, name: row.name }
  }
  const active = await resolveActiveClientDeal(caller.clientId)
  if (!active) throw Errors.badRequest('No tenés un proyecto activo para asociar la solicitud')
  // Segunda lectura para traer el nombre: `resolveActiveClientDeal` proyecta
  // solo id y portal, y re-validar el portal acá no cuesta nada.
  const row = await assertDealInPortal(caller.portalId, active.id)
  return { id: row.id, name: row.name }
}

async function findByClientRequestId(dealId: string, clientRequestId: string): Promise<CRRow | null> {
  const [row] = await db
    .select()
    .from(changeRequest)
    .where(and(eq(changeRequest.dealId, dealId), eq(changeRequest.clientRequestId, clientRequestId)))
    .limit(1)
  return row ?? null
}

// ── Decisiones del cliente ──────────────────────────────────────────────────

/**
 * Estado destino de una acción del cliente según el catálogo compartido. 409 si
 * la acción no aplica al estado actual — el portal ya no ofrece el botón, pero
 * una llamada directa tiene que rebotar igual.
 */
function targetStatusFor(cr: CRRow, action: ChangeRequestClientAction): ChangeRequestStatus {
  const target = CLIENT_TRANSITIONS[cr.status as ChangeRequestStatus]?.[action]
  if (!target) throw Errors.conflict('Esta change request no está esperando esa acción')
  return target
}

/**
 * Toda escritura de estado del cliente va condicionada al estado leído
 * (`WHERE id = ? AND status = ?`): si otra request la movió en el medio, el
 * UPDATE no afecta filas y sale 409 en vez de pisar la decisión anterior.
 */
async function applyStatus(tx: Tx, cr: CRRow, next: ChangeRequestStatus, patch: Partial<typeof changeRequest.$inferInsert>): Promise<void> {
  const [row] = await tx
    .update(changeRequest)
    .set({ ...patch, status: next, updatedAt: new Date() })
    .where(and(eq(changeRequest.id, cr.id), eq(changeRequest.status, cr.status)))
    .returning({ id: changeRequest.id })
  if (!row) throw Errors.conflict('La change request cambió de estado mientras tanto. Recargá e intentá de nuevo.')
}

export async function clientApprove(caller: ClientCaller, id: string, input: ClientApproveDTO): Promise<void> {
  const cr = await getClientCR(caller.clientId, id)
  const next = targetStatusFor(cr, 'approve')
  const comment = input?.comment ?? null

  await db.transaction(async (tx) => {
    const snapshot = await decideProposal(tx, cr.currentProposalId, 'accepted', caller.clientId)
    await applyStatus(tx, cr, next, {
      approvedAt: new Date(),
      approvedBy: caller.clientId,
      // Se fija la propuesta aprobada: `currentProposalId` puede seguir
      // avanzando después, y sin esto se pierde sobre qué números cerró.
      approvedProposalId: cr.currentProposalId,
      decisionComment: comment,
    })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'approved',
      actorRole: 'client',
      fromStatus: cr.status,
      toStatus: next,
      comment,
      clientId: caller.clientId,
      metadata: snapshot,
    })
    await writeAudit({
      tx,
      portalId: cr.portalId,
      clientId: caller.clientId,
      entityType: 'change_request',
      entityId: id,
      action: 'CR_APPROVED',
      payload: snapshot,
    })
  })

  await notifyAdmins(cr.portalId, 'cr_approved', { crId: id, crNumber: cr.number, dealName: cr.title }, {
    entity: { type: 'change_request', id },
    dedupeKey: `cr_approved:${id}`,
  })
}

export async function clientReject(caller: ClientCaller, id: string, input: ClientRejectDTO): Promise<void> {
  const cr = await getClientCR(caller.clientId, id)
  const next = targetStatusFor(cr, 'reject')
  const reason = input?.reason ?? null
  const comment = input?.comment ?? null

  await db.transaction(async (tx) => {
    const snapshot = await decideProposal(tx, cr.currentProposalId, 'rejected', caller.clientId)
    await applyStatus(tx, cr, next, { rejectedAt: new Date(), decisionReason: reason, decisionComment: comment })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'rejected',
      actorRole: 'client',
      fromStatus: cr.status,
      toStatus: next,
      comment,
      clientId: caller.clientId,
      metadata: { ...snapshot, reason },
    })
    await writeAudit({
      tx,
      portalId: cr.portalId,
      clientId: caller.clientId,
      entityType: 'change_request',
      entityId: id,
      action: 'CR_REJECTED',
      payload: { reason },
    })
  })

  await notifyAdmins(cr.portalId, 'cr_rejected', { crId: id, crNumber: cr.number, dealName: cr.title }, {
    entity: { type: 'change_request', id },
    dedupeKey: `cr_rejected:${id}`,
  })
}

/**
 * El cliente no aprueba ni rechaza: pide un ajuste. Además del evento se crea
 * un comentario real con el mismo texto — si viviera solo en el historial, la
 * conversación de la CR no lo mostraría y el equipo tendría que ir a buscar
 * "qué pidió" a otra pestaña.
 */
export async function clientRequestAdjustment(caller: ClientCaller, id: string, input: ClientAdjustmentDTO): Promise<void> {
  const cr = await getClientCR(caller.clientId, id)
  const next = targetStatusFor(cr, 'request_adjustment')

  await db.transaction(async (tx) => {
    await applyStatus(tx, cr, next, {})
    await tx.insert(changeRequestComment).values({ changeRequestId: id, body: input.comment, authorClient: caller.clientId })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'adjustment_requested',
      actorRole: 'client',
      fromStatus: cr.status,
      toStatus: next,
      comment: input.comment,
      clientId: caller.clientId,
      metadata: { area: input.area },
    })
    await writeAudit({
      tx,
      portalId: cr.portalId,
      clientId: caller.clientId,
      entityType: 'change_request',
      entityId: id,
      action: 'CR_ADJUSTMENT_REQUESTED',
      payload: { area: input.area },
    })
  })

  // Sin dedupeKey, mismo criterio que los comentarios: cada pedido de ajuste es
  // un hecho propio. La clave anterior (`:${cr.status}`) era CONSTANTE por CR
  // —en este punto `cr.status` es siempre 'sent', que es el único origen
  // posible— así que `onConflictDoNothing` se comía todos los avisos menos el
  // primero: el equipo nunca se enteraba del segundo pedido sobre la misma CR.
  await notifyAdmins(cr.portalId, 'cr_adjustment_requested', { crId: id, crNumber: cr.number, area: input.area }, {
    entity: { type: 'change_request', id },
  })
}

/** Cancelar solo la propia: una CR que abrió el equipo no la baja el cliente. */
export async function clientCancel(caller: ClientCaller, id: string, input: ClientCancelDTO): Promise<void> {
  const cr = await getClientCR(caller.clientId, id)
  if (cr.createdByClient !== caller.clientId) {
    throw Errors.forbidden('Solo podés cancelar las solicitudes que abriste vos')
  }
  const next = targetStatusFor(cr, 'cancel')
  const comment = input?.comment ?? null

  await db.transaction(async (tx) => {
    await applyStatus(tx, cr, next, { cancelledAt: new Date(), decisionComment: comment })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'cancelled',
      actorRole: 'client',
      fromStatus: cr.status,
      toStatus: next,
      comment,
      clientId: caller.clientId,
    })
    await writeAudit({
      tx,
      portalId: cr.portalId,
      clientId: caller.clientId,
      entityType: 'change_request',
      entityId: id,
      action: 'CR_CANCELLED',
      payload: { from: cr.status },
    })
  })

  await notifyAdmins(cr.portalId, 'cr_cancelled_by_client', { crId: id, crNumber: cr.number, title: cr.title }, {
    entity: { type: 'change_request', id },
    dedupeKey: `cr_cancelled_by_client:${id}`,
  })
}

// ── Conversación y adjuntos ─────────────────────────────────────────────────

export async function clientComment(caller: ClientCaller, id: string, input: ClientCommentDTO) {
  const cr = await getClientCR(caller.clientId, id)
  const actor = clientActor(caller)
  const prepared = await prepareCRUploads(actor, input.uploads)

  const row = await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(changeRequestComment)
      .values({ changeRequestId: id, body: input.body, authorClient: caller.clientId })
      .returning()
    if (!comment) throw Errors.internal('No se pudo guardar el comentario')
    await attachCRUploads(tx, { changeRequestId: id, commentId: comment.id, prepared, actor })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'comment_added',
      actorRole: 'client',
      clientId: caller.clientId,
      metadata: { commentId: comment.id, attachments: prepared.length },
    })
    return comment
  })

  // Sin dedupeKey: cada comentario es un hecho propio. Antes el equipo no se
  // enteraba de que el cliente había escrito.
  await notifyAdmins(cr.portalId, 'cr_client_commented', { crId: id, crNumber: cr.number }, {
    entity: { type: 'change_request', id },
  })
  return row
}

export async function clientAddAttachments(caller: ClientCaller, id: string, uploads: ClientCommentDTO['uploads']): Promise<{ attached: number }> {
  const cr = await getClientCR(caller.clientId, id)
  const actor = clientActor(caller)
  const prepared = await prepareCRUploads(actor, uploads)

  const attached = await db.transaction(async (tx) => {
    const names = await attachCRUploads(tx, { changeRequestId: cr.id, prepared, actor })
    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'attachment_added',
      actorRole: 'client',
      clientId: caller.clientId,
      metadata: { names },
    })
    return names.length
  })

  // Sin dedupeKey: cada subida es un hecho propio. Antes esto solo registraba el
  // evento, así que el cliente subía un plano a su solicitud y el equipo se
  // enteraba únicamente si entraba a mirar el detalle.
  if (attached > 0) {
    await notifyAdmins(cr.portalId, 'cr_client_attached', { crId: id, crNumber: cr.number, count: attached }, {
      entity: { type: 'change_request', id },
    })
  }
  return { attached }
}
