import { and, desc, eq, inArray } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { changeRequest, document, hubUser } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { assertDealInPortal } from '../../lib/portal-access'
import { writeAudit } from '../../lib/audit'
import { claimUpload, prepareUploadClaim } from '../uploads/uploads.service'
import type { CreateDocumentDTO, ListDocumentsQueryDTO } from './documents.schema'

type DocumentRow = typeof document.$inferSelect

export interface DocumentDTO {
  id: string
  portalId: string
  dealId: string | null
  crId: string | null
  name: string
  type: string
  source: string | null
  storageKey: string | null
  signedAt: string | null
  createdBy: string | null
  createdAt: string
}

function toDTO(row: DocumentRow): DocumentDTO {
  return {
    id: row.id,
    portalId: row.portalId,
    dealId: row.dealId,
    crId: row.crId,
    name: row.name,
    type: row.type,
    source: row.source,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listDocuments(
  portalId: string,
  query: ListDocumentsQueryDTO,
): Promise<Paginated<DocumentDTO>> {
  const conditions = [eq(document.portalId, portalId), eq(document.archived, false)]
  if (query.dealId) {
    conditions.push(eq(document.dealId, query.dealId))
  }

  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(document)
    .where(and(...conditions, cursor ? cursorWhere(document.createdAt, document.id, cursor) : undefined))
    .orderBy(desc(document.createdAt), desc(document.id))
    .limit(query.limit + 1)

  const { items, nextCursor } = paginateRows(rows, query.limit)
  return { items: items.map(toDTO), nextCursor }
}

export async function getDocument(portalId: string, id: string): Promise<DocumentDTO> {
  const [row] = await db
    .select()
    .from(document)
    .where(and(eq(document.id, id), eq(document.portalId, portalId), eq(document.archived, false)))
    .limit(1)

  if (!row) throw Errors.notFound('Documento no encontrado')
  return toDTO(row)
}

export async function createDocument(
  portalId: string,
  userId: string,
  input: CreateDocumentDTO,
): Promise<DocumentDTO> {
  const preparedClaim = input.storageKey
    ? await prepareUploadClaim({ storageKey: input.storageKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'deal_document' })
    : null

  return db.transaction(async (tx) => {
    // El portal del cliente lista documentos por deal: un dealId de otro tenant
    // inyectaría este documento en el portal de un cliente ajeno.
    await assertDealInPortal(portalId, input.dealId, tx)
    if (input.crId) {
      const [cr] = await tx
        .select({ id: changeRequest.id })
        .from(changeRequest)
        .where(and(eq(changeRequest.id, input.crId), eq(changeRequest.portalId, portalId), eq(changeRequest.dealId, input.dealId)))
        .limit(1)
      if (!cr) throw Errors.badRequest('Change request inexistente')
    }
    if (input.storageKey) await claimUpload(tx, preparedClaim)

    const [row] = await tx
      .insert(document)
      .values({
        portalId,
        dealId: input.dealId,
        crId: input.crId ?? null,
        name: input.name,
        type: input.type,
        source: 'manual',
        storageKey: input.storageKey ?? null,
        // Omitido → cae al default de la columna (true).
        ...(input.visibleToClient === undefined ? {} : { visibleToClient: input.visibleToClient }),
        createdBy: userId,
      })
      .returning()

    if (!row) throw Errors.internal('Error al crear documento')
    return toDTO(row)
  })
}

/**
 * Archiva el documento (nunca DELETE). La fila guarda `docuseal_submission_id`,
 * el único vínculo con un contrato firmado (la URL del PDF no se persiste):
 * borrarla dejaba el contrato irrecuperable desde el CRM.
 */
export async function archiveDocument(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(document)
      .set({ archived: true, archivedAt: new Date() })
      .where(and(eq(document.id, id), eq(document.portalId, portalId), eq(document.archived, false)))
      .returning({ id: document.id })
    if (!row) throw Errors.notFound('Documento no encontrado')
    await writeAudit({ tx, portalId, userId, entityType: 'document', entityId: id, action: 'ARCHIVE', payload: { archived: true } })
  })
}

// ─── Client-facing (scoped to client's deals) ─────────────────────────────────

export interface ClientDocumentDTO {
  id: string
  dealId: string | null
  name: string
  type: string
  storageKey: string | null
  signedAt: string | null
  /** Estado de firma en DocuSeal (pending | completed | declined | expired). Null si el documento no pasó por DocuSeal. */
  docusealStatus: string | null
  /** Nombre de la persona del equipo que lo subió (no el email ni el id). Null si no se puede resolver. */
  uploadedBy: string | null
  createdAt: string
}

export async function listClientDocuments(
  portalId: string,
  dealIds: string[],
  query: ListQuery,
): Promise<Paginated<ClientDocumentDTO>> {
  if (dealIds.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)

  // LEFT JOIN (no INNER): `document.created_by` es nullable — los documentos
  // de DocuSeal/generados pueden no tenerlo. Un INNER haría desaparecer del
  // portal esos documentos, una regresión de visibilidad silenciosa.
  const rows = await db
    .select({
      id: document.id,
      dealId: document.dealId,
      name: document.name,
      type: document.type,
      storageKey: document.storageKey,
      signedAt: document.signedAt,
      docusealStatus: document.docusealStatus,
      createdAt: document.createdAt,
      uploaderFirstName: hubUser.firstName,
      uploaderLastName: hubUser.lastName,
    })
    .from(document)
    .leftJoin(hubUser, eq(document.createdBy, hubUser.id))
    .where(
      and(
        eq(document.portalId, portalId),
        inArray(document.dealId, dealIds),
        eq(document.visibleToClient, true),
        eq(document.archived, false),
        cursor ? cursorWhere(document.createdAt, document.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(document.createdAt), desc(document.id))
    .limit(query.limit + 1)

  const { items, nextCursor } = paginateRows(rows, query.limit)
  const dtos = items.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    name: row.name,
    type: row.type,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    docusealStatus: row.docusealStatus,
    uploadedBy: [row.uploaderFirstName, row.uploaderLastName].filter(Boolean).join(' ').trim() || null,
    createdAt: row.createdAt.toISOString(),
  }))
  return { items: dtos, nextCursor }
}
