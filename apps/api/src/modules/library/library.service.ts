import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { libraryItem } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { CreateLibraryItemDTO, UpdateLibraryItemDTO, ListLibraryQueryType } from './library.schema'

type LibraryItemRow = typeof libraryItem.$inferSelect

/**
 * Verifica que el ítem exista, pertenezca al portal y no esté archivado.
 * Lanza Errors.notFound si no cumple.
 */
async function requireItemInPortal(portalId: string, id: string): Promise<LibraryItemRow> {
  const [row] = await db
    .select()
    .from(libraryItem)
    .where(and(eq(libraryItem.id, id), eq(libraryItem.portalId, portalId), eq(libraryItem.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Ítem de biblioteca no encontrado')
  return row
}

export async function listLibraryItems(
  portalId: string,
  query: ListLibraryQueryType,
): Promise<LibraryItemRow[]> {
  const conditions = [
    eq(libraryItem.portalId, portalId),
    eq(libraryItem.archived, false),
    ...(query.type ? [eq(libraryItem.type, query.type)] : []),
  ]
  return db
    .select()
    .from(libraryItem)
    .where(and(...conditions))
    .orderBy(desc(libraryItem.createdAt))
}

export async function getLibraryItem(portalId: string, id: string): Promise<LibraryItemRow> {
  return requireItemInPortal(portalId, id)
}

export async function createLibraryItem(
  portalId: string,
  userId: string,
  input: CreateLibraryItemDTO,
): Promise<LibraryItemRow> {
  const [row] = await db
    .insert(libraryItem)
    .values({
      portalId,
      type: input.type,
      name: input.name,
      category: input.category ?? null,
      description: input.description ?? null,
      storageKey: input.storageKey ?? null,
      url: input.url ?? null,
      createdBy: userId,
    })
    .returning()

  if (!row) throw Errors.internal('No se pudo crear el ítem de biblioteca')
  return row
}

export async function updateLibraryItem(
  portalId: string,
  id: string,
  input: UpdateLibraryItemDTO,
): Promise<LibraryItemRow> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: libraryItem.id })
      .from(libraryItem)
      .where(and(eq(libraryItem.id, id), eq(libraryItem.portalId, portalId), eq(libraryItem.archived, false)))
      .limit(1)
      .then(([row]) => {
        if (!row) throw Errors.notFound('Ítem de biblioteca no encontrado')
      })

    const [updated] = await tx
      .update(libraryItem)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(libraryItem.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el ítem de biblioteca')
    return updated
  })
}

export async function archiveLibraryItem(portalId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: libraryItem.id })
      .from(libraryItem)
      .where(and(eq(libraryItem.id, id), eq(libraryItem.portalId, portalId), eq(libraryItem.archived, false)))
      .limit(1)
    if (!row) throw Errors.notFound('Ítem de biblioteca no encontrado')

    await tx
      .update(libraryItem)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(libraryItem.id, id))
  })
}
