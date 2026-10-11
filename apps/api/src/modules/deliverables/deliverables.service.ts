import { and, desc, eq } from 'drizzle-orm'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { deliverable, deal } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { assertChangeRequestInPortal, assertDealInPortal } from '../../lib/portal-access'
import type { Tx } from '../../lib/audit'
import type { CreateDeliverableDTO, UpdateDeliverableDTO, DeliverableListQueryType } from './deliverables.schema'
import { notifyDealClients } from '../notifications/notify'

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
    .where(and(eq(deliverable.id, id), eq(deliverable.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Entregable no encontrado')
  return row.deliverable
}

export async function listDeliverables(
  portalId: string,
  query: DeliverableListQueryType,
): Promise<Paginated<DeliverableRow>> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select({ deliverable })
    .from(deliverable)
    .innerJoin(deal, and(eq(deal.id, deliverable.dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .where(
      and(
        eq(deliverable.archived, false),
        query.dealId ? eq(deliverable.dealId, query.dealId) : undefined,
        cursor ? cursorWhere(deliverable.createdAt, deliverable.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(deliverable.createdAt), desc(deliverable.id))
    .limit(query.limit + 1)

  const { items, nextCursor } = paginateRows(rows, query.limit, (r) => r.deliverable)
  return { items: items.map((r) => r.deliverable), nextCursor }
}

export async function createDeliverable(
  portalId: string,
  userId: string,
  input: CreateDeliverableDTO,
): Promise<DeliverableRow> {
  return db.transaction(async (tx) => {
    await assertDealInPortal(portalId, input.dealId, tx)
    // Mismo deal, no solo mismo portal: el detalle de la CR se lee desde el
    // portal del cliente y un entregable de otro proyecto no puede colarse ahí.
    await assertChangeRequestInPortal(portalId, input.changeRequestId, tx, input.dealId)

    const [row] = await tx
      .insert(deliverable)
      .values({
        dealId: input.dealId,
        title: input.title,
        type: input.type,
        url: input.url ?? null,
        description: input.description ?? null,
        changeRequestId: input.changeRequestId ?? null,
        // Omitido → cae al default de la columna (true).
        ...(input.visibleToClient === undefined ? {} : { visibleToClient: input.visibleToClient }),
        createdBy: userId,
      })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el entregable')
    return row
  }).then(async (row) => {
    // Solo si el cliente puede verlo: un entregable interno no le interesa y
    // avisarle de algo que no va a encontrar en su portal es peor que callar.
    if (row.visibleToClient) {
      await notifyDealClients(portalId, row.dealId, 'deliverable_ready', {
        dealId: row.dealId,
        deliverableTitle: row.title,
      }, { entity: { type: 'deliverable', id: row.id }, dedupeKey: `deliverable_ready:${row.id}` })
    }
    return row
  })
}

export async function updateDeliverable(
  portalId: string,
  id: string,
  input: UpdateDeliverableDTO,
): Promise<DeliverableRow> {
  return db.transaction(async (tx) => {
    const current = await requireDeliverableInPortal(tx, id, portalId)
    await assertChangeRequestInPortal(portalId, input.changeRequestId, tx, current.dealId)

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

/** Archiva el entregable (nunca DELETE): conserva su historial de aprobación y feedback del cliente. */
export async function archiveDeliverable(portalId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireDeliverableInPortal(tx, id, portalId)
    await tx.update(deliverable).set({ archived: true, archivedAt: new Date() }).where(eq(deliverable.id, id))
  })
}
