import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { document } from '../../db/schema'
import { Errors } from '../../lib/errors'
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
): Promise<DocumentDTO[]> {
  const conditions = [eq(document.portalId, portalId)]
  if (query.dealId) {
    conditions.push(eq(document.dealId, query.dealId))
  }

  const rows = await db
    .select()
    .from(document)
    .where(and(...conditions))
    .orderBy(desc(document.createdAt))

  return rows.map(toDTO)
}

export async function getDocument(portalId: string, id: string): Promise<DocumentDTO> {
  const [row] = await db
    .select()
    .from(document)
    .where(and(eq(document.id, id), eq(document.portalId, portalId)))
    .limit(1)

  if (!row) throw Errors.notFound('Documento no encontrado')
  return toDTO(row)
}

export async function createDocument(
  portalId: string,
  userId: string,
  input: CreateDocumentDTO,
): Promise<DocumentDTO> {
  const [row] = await db
    .insert(document)
    .values({
      portalId,
      dealId: input.dealId,
      crId: input.crId ?? null,
      name: input.name,
      type: input.type,
      source: 'manual',
      storageKey: input.storageKey ?? null,
      createdBy: userId,
    })
    .returning()

  if (!row) throw Errors.internal('Error al crear documento')
  return toDTO(row)
}

export async function deleteDocument(portalId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.id, id), eq(document.portalId, portalId)))
    .limit(1)

  if (!row) throw Errors.notFound('Documento no encontrado')

  await db.delete(document).where(eq(document.id, id))
}

// ─── Client-facing (scoped to client's deals) ─────────────────────────────────

export interface ClientDocumentDTO {
  id: string
  dealId: string | null
  name: string
  type: string
  storageKey: string | null
  signedAt: string | null
  createdAt: string
}

export async function listClientDocuments(dealIds: string[]): Promise<ClientDocumentDTO[]> {
  if (dealIds.length === 0) return []

  const rows = await db
    .select()
    .from(document)
    .where(inArray(document.dealId, dealIds))
    .orderBy(desc(document.createdAt))

  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    name: row.name,
    type: row.type,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }))
}
