import { and, asc, desc, eq, isNull, ne, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { CLIENT_TRANSITIONS, type ChangeRequestStatus, type CRActorRole } from '@synous/shared'
import { db } from '../../db'
import {
  changeRequest,
  changeRequestAttachment,
  changeRequestComment,
  changeRequestHistory,
  changeRequestItem,
  changeRequestProposal,
  deal,
  deliverable,
  document,
  invoice,
} from '../../db/schema'
import { actorOf, resolveActorNames, type CRHistoryRow } from './cr-events'

export type CRRow = typeof changeRequest.$inferSelect
export type CRItemRow = typeof changeRequestItem.$inferSelect
export type CRProposalRow = typeof changeRequestProposal.$inferSelect
export type CRCommentRow = typeof changeRequestComment.$inferSelect
export type CRAttachmentRow = typeof changeRequestAttachment.$inferSelect

export interface ChangeRequestDTO extends CRRow {
  dealName: string | null
  requestedByName: string | null
  requestedByRole: 'admin' | 'client'
}

/**
 * Lo que ve el CLIENTE de la fila de la CR.
 *
 * Proyección EXPLÍCITA, no `...cr`: `portalId`, `createdBy`, `createdByClient`,
 * `approvedBy` y `clientRequestId` son ids internos que el portal no usa para
 * nada y que no tiene por qué conocer. Mandar la fila cruda no era explotable,
 * pero contradecía el principio de DTO del resto del módulo — y cada columna
 * nueva de la tabla se filtraba sola al portal sin que nadie lo decidiera.
 */
export interface ClientChangeRequestDTO
  extends Omit<ChangeRequestDTO, 'portalId' | 'createdBy' | 'createdByClient' | 'approvedBy' | 'clientRequestId'> {
  /**
   * ¿El portal puede ofrecer "Cancelar solicitud"? Lo decide el BACKEND, con el
   * mismo criterio que `clientCancel`: el estado tiene que admitir la acción Y
   * la CR tiene que haberla abierto este cliente. Sin este campo el portal
   * ofrecía el botón en CRs abiertas por el equipo y el backend respondía 403
   * con un mensaje que parecía un problema transitorio.
   */
  canCancel: boolean
}

export interface CRAttachmentDTO extends CRAttachmentRow {
  uploadedByName: string | null
  uploadedRole: CRActorRole
}

export interface CRProposalDTO extends CRProposalRow {
  items: CRItemRow[]
}

export interface CRCommentDTO extends CRCommentRow {
  authorName: string | null
  authorRole: CRActorRole
  attachments: CRAttachmentDTO[]
}

export interface CREventDTO extends CRHistoryRow {
  actorName: string | null
}

export interface CRLinkedDocument {
  id: string
  name: string
  type: string
  storageKey: string | null
  visibleToClient: boolean
  createdAt: Date
}

export interface CRLinkedInvoice {
  id: string
  number: number
  status: string
  total: string
  currency: string
  issueDate: string | null
  dueDate: string | null
}

export interface CRLinkedDeliverable {
  id: string
  title: string
  type: string
  status: string
  visibleToClient: boolean
}

export interface CRLinks {
  documents: CRLinkedDocument[]
  invoices: CRLinkedInvoice[]
  deliverables: CRLinkedDeliverable[]
}

interface CRDetailBase {
  items: CRItemRow[]
  proposals: CRProposalDTO[]
  /** La propuesta VIGENTE: la última enviada, la que el cliente tiene que decidir. */
  currentProposal: CRProposalDTO | null
  approvedProposal: CRProposalDTO | null
  /**
   * La propuesta en `draft` en curso — la que el equipo dejó a medio armar.
   * SEPARADA de `currentProposal`: una está esperando al cliente y la otra ni
   * siquiera salió. Sin este campo un borrador guardado quedaba invisible (el
   * detalle no lo devolvía y no había forma de enviarlo), así que el formulario
   * aparecía vacío al día siguiente y el envío creaba OTRA versión, dejando la
   * anterior huérfana en `draft` para siempre.
   */
  draftProposal: CRProposalDTO | null
  comments: CRCommentDTO[]
  events: CREventDTO[]
  attachments: CRAttachmentDTO[]
  links: CRLinks
}

export interface CRDetail extends CRDetailBase {
  changeRequest: ChangeRequestDTO
}

export interface ClientCRDetail extends CRDetailBase {
  changeRequest: ClientChangeRequestDTO
  /** El cliente NUNCA ve un borrador interno del equipo: siempre `null`. */
  draftProposal: null
}

/**
 * Los vínculos de una CR tienen que ser del MISMO proyecto que la CR.
 *
 * Filtrar solo por `change_request_id` alcanzaba para que un id mal vinculado a
 * mano (la factura del deal de otra empresa colgada de esta CR) apareciera en
 * el detalle — y, como el portal del cliente lee ese mismo detalle, se la
 * mostraba a un cliente que no tiene nada que ver con esa factura.
 *
 * `deal_id` es nullable en `invoice` y en `document`: del lado ADMIN esas filas
 * se aceptan igual (son del mismo portal y el equipo ya las ve en su propio
 * módulo), pero para el CLIENTE un vínculo sin proyecto no existe.
 */
function sameDeal(column: AnyPgColumn, dealId: string, forClient: boolean): SQL | undefined {
  return forClient ? eq(column, dealId) : or(eq(column, dealId), isNull(column))
}

/** Estados de factura que el cliente no tiene por qué ver colgando de una CR. */
const CLIENT_HIDDEN_INVOICE_STATUSES = ['draft', 'void'] as const

/**
 * Partes comunes a las dos superficies. `dealName` y `requestedBy` salen acá
 * sueltos porque cada superficie los monta sobre una proyección distinta de la
 * fila de la CR (completa para el equipo, recortada para el cliente).
 */
interface CRDetailPieces extends CRDetailBase {
  dealName: string | null
  requestedBy: { name: string | null; role: CRActorRole }
}

/**
 * Arma el detalle completo de UNA change request ya autorizada.
 *
 * El caller es el que decide si el actor puede verla (`getCRInPortal` del lado
 * admin, `getClientCR` del lado cliente): acá NO hay ninguna verificación de
 * tenant, solo lectura por `changeRequestId`. Comentarios, adjuntos y eventos
 * se leen SIEMPRE colgando de esa CR, nunca por id suelto, así que no hace
 * falta re-verificar cada hijo.
 *
 * `forClient` recorta lo que es interno del equipo: propuestas en borrador
 * (todavía no se enviaron), documentos/entregables marcados como no visibles y
 * facturas que todavía no se emitieron.
 */
async function loadDetailBase(cr: CRRow, forClient: boolean): Promise<CRDetailPieces> {
  const id = cr.id

  const [dealRow, items, proposalRows, commentRows, eventRows, attachmentRows, documents, invoices, deliverables] =
    await Promise.all([
      db.select({ name: deal.name }).from(deal).where(eq(deal.id, cr.dealId)).limit(1),
      db.select().from(changeRequestItem).where(eq(changeRequestItem.changeRequestId, id)),
      db
        .select()
        .from(changeRequestProposal)
        .where(
          forClient
            ? and(eq(changeRequestProposal.changeRequestId, id), ne(changeRequestProposal.status, 'draft'))
            : eq(changeRequestProposal.changeRequestId, id),
        )
        .orderBy(desc(changeRequestProposal.version)),
      db
        .select()
        .from(changeRequestComment)
        .where(eq(changeRequestComment.changeRequestId, id))
        .orderBy(asc(changeRequestComment.createdAt)),
      db
        .select()
        .from(changeRequestHistory)
        .where(eq(changeRequestHistory.changeRequestId, id))
        .orderBy(desc(changeRequestHistory.changedAt)),
      db
        .select()
        .from(changeRequestAttachment)
        .where(eq(changeRequestAttachment.changeRequestId, id))
        .orderBy(desc(changeRequestAttachment.uploadedAt)),
      db
        .select({
          id: document.id,
          name: document.name,
          type: document.type,
          storageKey: document.storageKey,
          visibleToClient: document.visibleToClient,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(
          and(
            eq(document.crId, id),
            eq(document.portalId, cr.portalId),
            sameDeal(document.dealId, cr.dealId, forClient),
            eq(document.archived, false),
          ),
        )
        .orderBy(desc(document.createdAt)),
      db
        .select({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          total: invoice.total,
          currency: invoice.currency,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.changeRequestId, id),
            eq(invoice.portalId, cr.portalId),
            sameDeal(invoice.dealId, cr.dealId, forClient),
            eq(invoice.archived, false),
            // Una factura en borrador todavía no se emitió y una anulada ya no
            // vale: mostrárselas al cliente es prometerle o cobrarle algo que
            // no existe.
            forClient
              ? and(...CLIENT_HIDDEN_INVOICE_STATUSES.map((s) => ne(invoice.status, s)))
              : undefined,
          ),
        )
        .orderBy(desc(invoice.number)),
      db
        .select({
          id: deliverable.id,
          title: deliverable.title,
          type: deliverable.type,
          status: deliverable.status,
          visibleToClient: deliverable.visibleToClient,
        })
        .from(deliverable)
        .where(
          and(
            eq(deliverable.changeRequestId, id),
            eq(deliverable.dealId, cr.dealId),
            eq(deliverable.archived, false),
          ),
        )
        .orderBy(desc(deliverable.createdAt)),
    ])

  const names = await resolveActorNames(
    [cr.createdBy, ...commentRows.map((c) => c.authorUser), ...eventRows.map((e) => e.changedByUser), ...attachmentRows.map((a) => a.uploadedBy)],
    [
      cr.createdByClient,
      ...commentRows.map((c) => c.authorClient),
      ...eventRows.map((e) => e.changedByClient),
      ...attachmentRows.map((a) => a.uploadedByClient),
    ],
  )

  const itemsByProposal = new Map<string, CRItemRow[]>()
  for (const item of items) {
    if (!item.proposalId) continue
    const bucket = itemsByProposal.get(item.proposalId)
    if (bucket) bucket.push(item)
    else itemsByProposal.set(item.proposalId, [item])
  }
  const proposals: CRProposalDTO[] = proposalRows.map((p) => ({ ...p, items: itemsByProposal.get(p.id) ?? [] }))

  const attachments: CRAttachmentDTO[] = attachmentRows.map((a) => {
    const actor = actorOf(names, a.uploadedBy, a.uploadedByClient)
    return { ...a, uploadedByName: actor.name, uploadedRole: actor.role }
  })
  const attachmentsByComment = new Map<string, CRAttachmentDTO[]>()
  for (const att of attachments) {
    if (!att.commentId) continue
    const bucket = attachmentsByComment.get(att.commentId)
    if (bucket) bucket.push(att)
    else attachmentsByComment.set(att.commentId, [att])
  }

  return {
    dealName: dealRow[0]?.name ?? null,
    requestedBy: actorOf(names, cr.createdBy, cr.createdByClient),
    items,
    proposals,
    currentProposal: proposals.find((p) => p.id === cr.currentProposalId) ?? null,
    approvedProposal: proposals.find((p) => p.id === cr.approvedProposalId) ?? null,
    // `proposals` viene ordenada por versión descendente: el borrador en curso
    // es el más nuevo. En el camino del cliente la query ya excluyó los drafts.
    draftProposal: proposals.find((p) => p.status === 'draft') ?? null,
    comments: commentRows.map((c) => {
      const actor = actorOf(names, c.authorUser, c.authorClient)
      return { ...c, authorName: actor.name, authorRole: actor.role, attachments: attachmentsByComment.get(c.id) ?? [] }
    }),
    events: eventRows.map((e) => ({ ...e, actorName: actorOf(names, e.changedByUser, e.changedByClient).name })),
    attachments,
    links: {
      documents: forClient ? documents.filter((d) => d.visibleToClient) : documents,
      invoices,
      deliverables: forClient ? deliverables.filter((d) => d.visibleToClient) : deliverables,
    },
  }
}

/** Detalle para el EQUIPO: la fila completa de la CR más todos sus hijos. */
export async function loadCRDetail(cr: CRRow): Promise<CRDetail> {
  const { dealName, requestedBy, ...rest } = await loadDetailBase(cr, false)
  return {
    changeRequest: {
      ...cr,
      dealName,
      requestedByName: requestedBy.name,
      // Una CR sin autor registrado (datos viejos) se muestra como del equipo:
      // 'system' no es un rol que la UI sepa dibujar en este campo.
      requestedByRole: cr.createdByClient ? 'client' : 'admin',
    },
    ...rest,
  }
}

/** ¿El cliente puede cancelar ESTA CR? Mismo criterio que `clientCancel`. */
export function canClientCancel(cr: CRRow, clientId: string): boolean {
  const allowed = Boolean(CLIENT_TRANSITIONS[cr.status as ChangeRequestStatus]?.cancel)
  return allowed && cr.createdByClient === clientId
}

/** Detalle para el PORTAL: proyección explícita, sin borradores ni ids internos. */
export async function loadClientCRDetail(cr: CRRow, clientId: string): Promise<ClientCRDetail> {
  const { dealName, requestedBy, draftProposal: _draft, ...rest } = await loadDetailBase(cr, true)
  return {
    changeRequest: toClientCR(cr, dealName, requestedBy.name, clientId),
    ...rest,
    draftProposal: null,
  }
}

/**
 * Proyección campo por campo. A propósito NO usa `...cr` con un `delete`: así,
 * si mañana la tabla gana una columna interna, no se filtra sola al portal —
 * hay que agregarla acá conscientemente.
 */
export function toClientCR(
  cr: CRRow,
  dealName: string | null,
  requestedByName: string | null,
  clientId: string,
): ClientChangeRequestDTO {
  return {
    id: cr.id,
    dealId: cr.dealId,
    number: cr.number,
    title: cr.title,
    description: cr.description,
    context: cr.context,
    priority: cr.priority,
    originalScopeRef: cr.originalScopeRef,
    proposedScope: cr.proposedScope,
    origin: cr.origin,
    status: cr.status,
    version: cr.version,
    totalAmount: cr.totalAmount,
    currency: cr.currency,
    timelineImpactDays: cr.timelineImpactDays,
    newDeliveryDate: cr.newDeliveryDate,
    currentProposalId: cr.currentProposalId,
    approvedProposalId: cr.approvedProposalId,
    decisionReason: cr.decisionReason,
    decisionComment: cr.decisionComment,
    submittedAt: cr.submittedAt,
    reviewStartedAt: cr.reviewStartedAt,
    approvedAt: cr.approvedAt,
    rejectedAt: cr.rejectedAt,
    cancelledAt: cr.cancelledAt,
    completedAt: cr.completedAt,
    createdAt: cr.createdAt,
    updatedAt: cr.updatedAt,
    dealName,
    requestedByName,
    requestedByRole: cr.createdByClient ? 'client' : 'admin',
    canCancel: canClientCancel(cr, clientId),
  }
}
