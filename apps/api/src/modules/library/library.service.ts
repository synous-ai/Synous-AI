/**
 * library.service.ts — Módulo de Biblioteca del CRM NOUS.
 *
 * Gestiona ítems de referencia del equipo: documentos, SOPs (procedimientos
 * y checklists), plantillas, contratos base, propuestas base y docs técnicos.
 *
 * Extensiones sobre la versión original:
 *   - `kind`: discrimina entre procedure y checklist dentro de type='sop'.
 *   - `steps`: lista ordenada de pasos/ítems (jsonb). Se REEMPLAZA en updates
 *     (nunca merge `||`). El front siempre envía la lista completa reordenada.
 *   - `ownerId`: ID del hub_user responsable del contenido.
 *
 * Todos los errores de negocio se lanzan con AppError vía Errors.*.
 */

import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { libraryItem } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type {
  CreateLibraryItemDTO,
  UpdateLibraryItemDTO,
  ListLibraryQueryType,
} from './library.schema'

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

/**
 * Lista ítems del portal con filtros opcionales por type y kind.
 *
 * El filtro por kind (client-side en el front para /library/sops) también
 * está disponible server-side para queries directas o futuras integraciones.
 */
export async function listLibraryItems(
  portalId: string,
  query: ListLibraryQueryType,
): Promise<LibraryItemRow[]> {
  const conditions = [
    eq(libraryItem.portalId, portalId),
    eq(libraryItem.archived, false),
    ...(query.type ? [eq(libraryItem.type, query.type)] : []),
    ...(query.kind ? [eq(libraryItem.kind, query.kind)] : []),
  ]
  return db
    .select()
    .from(libraryItem)
    .where(and(...conditions))
    .orderBy(desc(libraryItem.createdAt))
}

/** Devuelve un ítem por ID verificando pertenencia al portal. */
export async function getLibraryItem(portalId: string, id: string): Promise<LibraryItemRow> {
  return requireItemInPortal(portalId, id)
}

/**
 * Crea un nuevo ítem de biblioteca.
 *
 * Para ítems operativos (type='sop'):
 *   - `steps` se persiste como jsonb (lista ordenada de pasos).
 *   - `kind` discrimina procedure vs checklist.
 *   - `ownerId` asigna responsable (nullable).
 *
 * Para los demás types, steps/kind/ownerId se ignoran (null en DB).
 */
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
      // steps: solo para ítems operativos; default [] para el resto
      steps: (input.steps ?? []) as object,
      // kind y ownerId: solo con sentido para type='sop'
      kind: input.kind ?? null,
      ownerId: input.ownerId ?? null,
      createdBy: userId,
    })
    .returning()

  if (!row) throw Errors.internal('No se pudo crear el ítem de biblioteca')
  return row
}

/**
 * Actualiza un ítem de biblioteca.
 *
 * REGLA CRÍTICA para `steps`: se REEMPLAZA la lista completa, nunca se hace
 * merge parcial con `||` (como haríamos con la columna `custom`). El front
 * siempre envía el array completo reordenado/editado. Esto garantiza que el
 * orden y los borrados sean exactos y no haya items fantasma.
 */
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

    // Construir el patch solo con los campos que vienen definidos
    const patch: Partial<typeof libraryItem.$inferInsert> = { updatedAt: new Date() }
    if (input.type !== undefined) patch.type = input.type
    if (input.name !== undefined) patch.name = input.name
    if (input.category !== undefined) patch.category = input.category
    if (input.description !== undefined) patch.description = input.description
    if (input.storageKey !== undefined) patch.storageKey = input.storageKey
    if (input.url !== undefined) patch.url = input.url
    if (input.kind !== undefined) patch.kind = input.kind
    if (input.ownerId !== undefined) patch.ownerId = input.ownerId

    // steps: reemplazo completo — si viene undefined, no se toca.
    // Nunca usar SQL `steps || $1` (eso sería para la columna `custom`).
    if (input.steps !== undefined) {
      patch.steps = input.steps as object
    }

    const [updated] = await tx
      .update(libraryItem)
      .set(patch)
      .where(eq(libraryItem.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el ítem de biblioteca')
    return updated
  })
}

/** Archiva un ítem de biblioteca (soft-delete). */
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
