import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db, type DB } from '../../db'
import { changeRequest, clientAccount, contact, document, documentFolder, hubUser, recordHistory } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { assertDealInPortal, assertFolderInDeal } from '../../lib/portal-access'
import { writeAudit, recordFieldChanges, type Tx } from '../../lib/audit'
import { claimUpload, prepareUploadClaim } from '../uploads/uploads.service'
import type {
  CreateDocumentDTO,
  CreateDocumentFolderDTO,
  ListDocumentsQueryDTO,
  UpdateDocumentDTO,
} from './documents.schema'

type Executor = DB | Tx

type DocumentRow = typeof document.$inferSelect

export interface DocumentDTO {
  id: string
  portalId: string
  dealId: string | null
  crId: string | null
  /** Carpeta del proyecto (null = raíz). Ver `document_folder`. */
  folderId: string | null
  name: string
  type: string
  source: string | null
  storageKey: string | null
  signedAt: string | null
  createdBy: string | null
  /** Quién subió el archivo desde el Portal, cuando fue el cliente. Null si lo subió el equipo o es generado/DocuSeal. */
  uploadedByClientAccountId: string | null
  createdAt: string
}

function toDTO(row: DocumentRow): DocumentDTO {
  return {
    id: row.id,
    portalId: row.portalId,
    dealId: row.dealId,
    crId: row.crId,
    folderId: row.folderId,
    name: row.name,
    type: row.type,
    source: row.source,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    createdBy: row.createdBy,
    uploadedByClientAccountId: row.uploadedByClientAccountId,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * El 23505 del índice único parcial `uq_document_folder_deal_name` es la
 * única violación posible de un insert/update de `document_folder` —
 * cualquier otro código tiene que seguir siendo un 500, no disfrazarse de
 * "nombre en uso" (mismo criterio que `updateClientBranding` en
 * branding.service.ts con `brand_slug`). Compartido entre el admin (este
 * archivo) y el cliente (client.service.ts) porque el constraint y el mapeo
 * son exactamente los mismos.
 */
export function mapFolderNameConflict(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw Errors.conflict('Ya existe una carpeta con ese nombre en este proyecto')
  }
  throw err
}

/**
 * Libera los documentos activos de una carpeta a la raíz del proyecto
 * (`folder_id = null`) y deja el rastro en `record_history`, en la MISMA
 * transacción que el caller usa para archivar la carpeta — nunca puede quedar
 * una carpeta archivada con documentos todavía colgando de ella. Compartido
 * entre el archivado del cliente (client.service.ts) y del equipo (más abajo
 * en este archivo): la operación es idéntica, solo cambia quién la dispara.
 */
export async function releaseFolderDocuments(
  tx: Tx,
  portalId: string,
  folderId: string,
  sourceType: string,
  changedBy: string | null,
): Promise<number> {
  const movedDocs = await tx
    .update(document)
    .set({ folderId: null })
    .where(and(eq(document.folderId, folderId), eq(document.archived, false)))
    .returning({ id: document.id })

  if (movedDocs.length > 0) {
    await tx.insert(recordHistory).values(
      movedDocs.map((d) => ({
        portalId,
        entityType: 'document',
        entityId: d.id,
        fieldName: 'folderId',
        oldValue: folderId,
        newValue: null,
        sourceType,
        changedBy,
      })),
    )
  }
  return movedDocs.length
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
    // Carpeta del MISMO deal — ver assertFolderInDeal para el porqué (FK
    // compuesta con MATCH SIMPLE no alcanza a cubrir todos los casos).
    await assertFolderInDeal(portalId, input.dealId, input.folderId, tx)
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
        folderId: input.folderId ?? null,
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

    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'document',
      entityId: row.id,
      action: 'CREATE',
      payload: { name: row.name, dealId: input.dealId, folderId: row.folderId },
    })

    return toDTO(row)
  })
}

/**
 * Renombra y/o mueve cualquier documento del deal (subido por el equipo o por
 * un cliente) — el equipo administra todo lo que haya en su portal, sin
 * chequeo de dueño (a diferencia de `updateClientDocument`). Mover solo
 * dentro del MISMO deal: `assertFolderInDeal` valida que la carpeta destino
 * pertenezca al `dealId` del documento.
 */
export async function updateDocument(
  portalId: string,
  userId: string,
  documentId: string,
  patch: UpdateDocumentDTO,
): Promise<DocumentDTO> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.portalId, portalId), eq(document.archived, false)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Documento no encontrado')

    if (patch.folderId !== undefined) {
      if (!row.dealId) throw Errors.badRequest('El documento no pertenece a un proyecto')
      await assertFolderInDeal(portalId, row.dealId, patch.folderId, tx)
    }

    const setPatch: { name?: string; folderId?: string | null } = {}
    if (patch.name !== undefined) setPatch.name = patch.name
    if (patch.folderId !== undefined) setPatch.folderId = patch.folderId

    const [updated] = await tx.update(document).set(setPatch).where(eq(document.id, documentId)).returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el documento')

    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'document',
      entityId: documentId,
      before: { name: row.name, folderId: row.folderId },
      after: setPatch,
      changedBy: userId,
    })
    await writeAudit({ tx, portalId, userId, entityType: 'document', entityId: documentId, action: 'UPDATE', payload: setPatch })

    return toDTO(updated)
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

// ─── Carpetas del admin ──────────────────────────────────────────────────────
//
// El equipo administra CUALQUIER carpeta del deal, sin chequeo de dueño —
// incluidas las que creó un cliente desde el Portal (decisión del negocio).
// Roles: crear/renombrar/mover → owner, member, collaborator; archivar → SOLO
// owner. Ambos se enforcean en el router con `authorize(...)`, igual que
// DELETE /documents/:id — el service no repite el chequeo de rol.

export interface DocumentFolderDTO {
  id: string
  dealId: string
  name: string
  /** Documentos activos dentro de la carpeta (no cuenta los archivados). */
  documentCount: number
  createdBy: string | null
  createdByClientAccountId: string | null
  createdAt: string
}

function toFolderDTO(
  row: { id: string; dealId: string; name: string; createdAt: Date; createdBy: string | null; createdByClientAccountId: string | null },
  documentCount: number,
): DocumentFolderDTO {
  return {
    id: row.id,
    dealId: row.dealId,
    name: row.name,
    documentCount,
    createdBy: row.createdBy,
    createdByClientAccountId: row.createdByClientAccountId,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listDocumentFolders(portalId: string, dealId: string): Promise<DocumentFolderDTO[]> {
  await assertDealInPortal(portalId, dealId)

  const rows = await db
    .select({
      id: documentFolder.id,
      dealId: documentFolder.dealId,
      name: documentFolder.name,
      createdBy: documentFolder.createdBy,
      createdByClientAccountId: documentFolder.createdByClientAccountId,
      createdAt: documentFolder.createdAt,
      documentCount: sql<number>`count(${document.id}) filter (where ${document.archived} = false)::int`,
    })
    .from(documentFolder)
    .leftJoin(document, eq(document.folderId, documentFolder.id))
    .where(and(eq(documentFolder.portalId, portalId), eq(documentFolder.dealId, dealId), eq(documentFolder.archived, false)))
    .groupBy(documentFolder.id)
    .orderBy(desc(documentFolder.createdAt))

  return rows.map((row) => toFolderDTO(row, row.documentCount))
}

export async function createDocumentFolder(
  portalId: string,
  userId: string,
  input: CreateDocumentFolderDTO,
): Promise<DocumentFolderDTO> {
  try {
    return await db.transaction(async (tx) => {
      await assertDealInPortal(portalId, input.dealId, tx)

      const [row] = await tx
        .insert(documentFolder)
        .values({ portalId, dealId: input.dealId, name: input.name, createdBy: userId })
        .returning()
      if (!row) throw Errors.internal('No se pudo crear la carpeta')

      await writeAudit({
        tx,
        portalId,
        userId,
        entityType: 'document_folder',
        entityId: row.id,
        action: 'CREATE',
        payload: { name: row.name, dealId: input.dealId },
      })

      return toFolderDTO(row, 0)
    })
  } catch (err) {
    return mapFolderNameConflict(err)
  }
}

export async function renameDocumentFolder(
  portalId: string,
  userId: string,
  folderId: string,
  name: string,
): Promise<DocumentFolderDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(documentFolder)
        .where(and(eq(documentFolder.id, folderId), eq(documentFolder.portalId, portalId), eq(documentFolder.archived, false)))
        .limit(1)
        .for('update')
      if (!row) throw Errors.notFound('Carpeta no encontrada')

      const [updated] = await tx.update(documentFolder).set({ name, updatedAt: new Date() }).where(eq(documentFolder.id, folderId)).returning()
      if (!updated) throw Errors.internal('No se pudo renombrar la carpeta')

      await recordFieldChanges({
        tx,
        portalId,
        entityType: 'document_folder',
        entityId: folderId,
        before: { name: row.name },
        after: { name },
        changedBy: userId,
      })
      await writeAudit({
        tx,
        portalId,
        userId,
        entityType: 'document_folder',
        entityId: folderId,
        action: 'RENAME',
        payload: { oldName: row.name, newName: name },
      })

      const [countRow] = await tx
        .select({ documentCount: sql<number>`count(*) filter (where ${document.archived} = false)::int` })
        .from(document)
        .where(eq(document.folderId, folderId))

      return toFolderDTO(updated, countRow?.documentCount ?? 0)
    })
  } catch (err) {
    return mapFolderNameConflict(err)
  }
}

/**
 * Archiva la carpeta (soft delete) y libera sus documentos activos a la raíz
 * del proyecto en la MISMA transacción — ver `releaseFolderDocuments`.
 */
export async function archiveDocumentFolder(portalId: string, userId: string, folderId: string): Promise<{ movedDocuments: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: documentFolder.id })
      .from(documentFolder)
      .where(and(eq(documentFolder.id, folderId), eq(documentFolder.portalId, portalId), eq(documentFolder.archived, false)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Carpeta no encontrada')

    const movedDocuments = await releaseFolderDocuments(tx, portalId, folderId, 'API', userId)

    await tx.update(documentFolder).set({ archived: true, archivedAt: new Date() }).where(eq(documentFolder.id, folderId))
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'document_folder',
      entityId: folderId,
      action: 'ARCHIVE',
      payload: { movedDocuments },
    })

    return { movedDocuments }
  })
}

// ─── Client-facing (scoped to client's deals) ─────────────────────────────────

export interface ClientDocumentDTO {
  id: string
  dealId: string | null
  /** Carpeta del proyecto (null = raíz). Ver `document_folder`. */
  folderId: string | null
  name: string
  type: string
  storageKey: string | null
  signedAt: string | null
  /** Estado de firma en DocuSeal (pending | completed | declined | expired). Null si el documento no pasó por DocuSeal. */
  docusealStatus: string | null
  /** Nombre de quien lo subió — persona del equipo O contacto del cliente. Null si no se puede resolver. */
  uploadedBy: string | null
  /**
   * ¿El cliente autenticado puede renombrarlo, moverlo o archivarlo? Solo lo
   * propio y nunca un documento de DocuSeal — evita que la UI intente una
   * acción que el service va a rechazar igual.
   */
  canManage: boolean
  createdAt: string
}

/** Fila cruda de la consulta compartida entre listado y lectura puntual del cliente. */
interface ClientDocumentJoinRow {
  id: string
  dealId: string | null
  folderId: string | null
  name: string
  type: string
  source: string | null
  storageKey: string | null
  signedAt: Date | null
  docusealStatus: string | null
  uploadedByClientAccountId: string | null
  createdAt: Date
  uploaderFirstName: string | null
  uploaderLastName: string | null
  clientContactFirstName: string | null
  clientContactLastName: string | null
}

/**
 * Select base para el DTO client-facing. Doble LEFT JOIN: `hub_user` (subida
 * del equipo) y `client_account → contact` (subida del propio cliente) —
 * mutuamente excluyentes por el CHECK `document_creator_check`, así que como
 * mucho uno de los dos resuelve un nombre.
 */
function clientDocumentSelect(executor: Executor = db) {
  return executor
    .select({
      id: document.id,
      dealId: document.dealId,
      folderId: document.folderId,
      name: document.name,
      type: document.type,
      source: document.source,
      storageKey: document.storageKey,
      signedAt: document.signedAt,
      docusealStatus: document.docusealStatus,
      uploadedByClientAccountId: document.uploadedByClientAccountId,
      createdAt: document.createdAt,
      uploaderFirstName: hubUser.firstName,
      uploaderLastName: hubUser.lastName,
      clientContactFirstName: contact.firstName,
      clientContactLastName: contact.lastName,
    })
    .from(document)
    .leftJoin(hubUser, eq(document.createdBy, hubUser.id))
    .leftJoin(clientAccount, eq(document.uploadedByClientAccountId, clientAccount.id))
    .leftJoin(contact, eq(clientAccount.contactId, contact.id))
}

function toClientDocumentDTO(row: ClientDocumentJoinRow, clientId: string): ClientDocumentDTO {
  const uploadedBy = row.uploaderFirstName
    ? [row.uploaderFirstName, row.uploaderLastName].filter(Boolean).join(' ').trim() || null
    : row.clientContactFirstName
      ? [row.clientContactFirstName, row.clientContactLastName].filter(Boolean).join(' ').trim() || null
      : null
  return {
    id: row.id,
    dealId: row.dealId,
    folderId: row.folderId,
    name: row.name,
    type: row.type,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    docusealStatus: row.docusealStatus,
    uploadedBy,
    canManage: row.uploadedByClientAccountId === clientId && row.source !== 'docuseal',
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listClientDocuments(
  portalId: string,
  clientId: string,
  dealIds: string[],
  query: ListQuery,
): Promise<Paginated<ClientDocumentDTO>> {
  if (dealIds.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)

  // LEFT JOIN (no INNER) en `hub_user`: `document.created_by` es nullable —
  // los documentos de DocuSeal/generados pueden no tenerlo. Un INNER haría
  // desaparecer del portal esos documentos, una regresión de visibilidad
  // silenciosa.
  const rows = await clientDocumentSelect()
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
  return { items: items.map((row) => toClientDocumentDTO(row, clientId)), nextCursor }
}

/**
 * Lectura puntual del DTO client-facing, para devolver la respuesta de un
 * create/update sin repetir la proyección. `executor` acepta el `tx` abierto
 * por el caller (client.service.ts) para no abrir una segunda conexión
 * mientras la transacción retiene la suya.
 */
export async function getClientDocumentDTOById(
  documentId: string,
  clientId: string,
  executor: Executor = db,
): Promise<ClientDocumentDTO> {
  const [row] = await clientDocumentSelect(executor).where(eq(document.id, documentId)).limit(1)
  if (!row) throw Errors.notFound('Documento no encontrado')
  return toClientDocumentDTO(row, clientId)
}
