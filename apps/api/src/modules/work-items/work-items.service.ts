import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { workItem } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { CreateWorkItemDTO, UpdateWorkItemDTO, ListWorkItemsQuery } from './work-items.schema'

type WorkItemRow = typeof workItem.$inferSelect

/**
 * Verifica que el ítem exista, pertenezca al portal y no esté archivado.
 * Lanza Errors.notFound si no cumple.
 */
async function requireItemInPortal(portalId: string, id: string): Promise<WorkItemRow> {
  const [row] = await db
    .select()
    .from(workItem)
    .where(and(eq(workItem.id, id), eq(workItem.portalId, portalId), eq(workItem.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Ítem de operaciones no encontrado')
  return row
}

export async function listWorkItems(
  portalId: string,
  query: ListWorkItemsQuery,
): Promise<WorkItemRow[]> {
  const conditions = [
    eq(workItem.portalId, portalId),
    eq(workItem.archived, false),
    ...(query.type ? [eq(workItem.type, query.type)] : []),
    ...(query.status ? [eq(workItem.status, query.status)] : []),
  ]
  return db
    .select()
    .from(workItem)
    .where(and(...conditions))
    .orderBy(desc(workItem.createdAt))
}

export async function getWorkItem(portalId: string, id: string): Promise<WorkItemRow> {
  return requireItemInPortal(portalId, id)
}

export async function createWorkItem(
  portalId: string,
  userId: string,
  input: CreateWorkItemDTO,
): Promise<WorkItemRow> {
  const [row] = await db
    .insert(workItem)
    .values({
      portalId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'open',
      priority: input.priority ?? 'medium',
      dealId: input.dealId ?? null,
      assignedTo: input.assignedTo ?? null,
      createdBy: userId,
    })
    .returning()

  if (!row) throw Errors.internal('No se pudo crear el ítem de operaciones')
  return row
}

export async function updateWorkItem(
  portalId: string,
  id: string,
  input: UpdateWorkItemDTO,
): Promise<WorkItemRow> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workItem.id })
      .from(workItem)
      .where(and(eq(workItem.id, id), eq(workItem.portalId, portalId), eq(workItem.archived, false)))
      .limit(1)
      .then(([row]) => {
        if (!row) throw Errors.notFound('Ítem de operaciones no encontrado')
      })

    const [updated] = await tx
      .update(workItem)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(workItem.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el ítem de operaciones')
    return updated
  })
}

export async function archiveWorkItem(portalId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: workItem.id })
      .from(workItem)
      .where(and(eq(workItem.id, id), eq(workItem.portalId, portalId), eq(workItem.archived, false)))
      .limit(1)
    if (!row) throw Errors.notFound('Ítem de operaciones no encontrado')

    await tx
      .update(workItem)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(workItem.id, id))
  })
}
