import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { deliverable, deal } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { assertDealInPortal } from '../../lib/portal-access'
import type { Tx } from '../../lib/audit'
import type { CreateDeliverableDTO, UpdateDeliverableDTO, DeliverableListQueryType } from './deliverables.schema'

type DeliverableRow = typeof deliverable.$inferSelect

/**
 * Verifica que el entregable exista y su deal pertenezca al portal.
 * Lanza Errors.notFound si no cumple.
 */
async function requireDeliverableInPortal(
  tx: Tx,
  id: string,
  portalId: string,
): Promise<DeliverableRow> {
  const [row] = await tx
    .select({ deliverable })
    .from(deliverable)
    .innerJoin(deal, and(eq(deal.id, deliverable.dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .where(eq(deliverable.id, id))
    .limit(1)
  if (!row) throw Errors.notFound('Entregable no encontrado')
  return row.deliverable
}

export async function listDeliverables(
  portalId: string,
  query: DeliverableListQueryType,
): Promise<DeliverableRow[]> {
  const rows = await db
    .select({ deliverable })
    .from(deliverable)
    .innerJoin(deal, and(eq(deal.id, deliverable.dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .where(query.dealId ? eq(deliverable.dealId, query.dealId) : undefined)
    .orderBy(desc(deliverable.createdAt))

  return rows.map((r) => r.deliverable)
}

export async function createDeliverable(
  portalId: string,
  userId: string,
  input: CreateDeliverableDTO,
): Promise<DeliverableRow> {
  return db.transaction(async (tx) => {
    await assertDealInPortal(portalId, input.dealId)

    const [row] = await tx
      .insert(deliverable)
      .values({
        dealId: input.dealId,
        title: input.title,
        type: input.type,
        url: input.url ?? null,
        description: input.description ?? null,
        createdBy: userId,
      })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el entregable')
    return row
  })
}

export async function updateDeliverable(
  portalId: string,
  id: string,
  input: UpdateDeliverableDTO,
): Promise<DeliverableRow> {
  return db.transaction(async (tx) => {
    await requireDeliverableInPortal(tx, id, portalId)

    const reviewTimestamp =
      input.status === 'approved' || input.status === 'changes_requested'
        ? new Date()
        : undefined

    const [updated] = await tx
      .update(deliverable)
      .set({
        ...input,
        ...(reviewTimestamp ? { reviewedAt: reviewTimestamp } : {}),
      })
      .where(eq(deliverable.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el entregable')
    return updated
  })
}

export async function deleteDeliverable(portalId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireDeliverableInPortal(tx, id, portalId)
    await tx.delete(deliverable).where(eq(deliverable.id, id))
  })
}
