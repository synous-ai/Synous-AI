import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { deal, pipelineStage, contact, clientAccount, clientDealAccess } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { createNotification } from '../notifications/notifications.service'

const ENTITY = 'deal'
type DealRow = typeof deal.$inferSelect

/** Valida que el stage exista y pertenezca al pipeline del deal. */
async function assertStageInPipeline(
  tx: Tx,
  pipelineId: string,
  stageId: string,
): Promise<typeof pipelineStage.$inferSelect> {
  const [stage] = await tx.select().from(pipelineStage).where(eq(pipelineStage.id, stageId)).limit(1)
  if (!stage) throw Errors.badRequest('Stage inexistente')
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest('El stage no pertenece al pipeline indicado')
  return stage
}

/**
 * Activa el portal del cliente al ganar un deal: crea client_account (con invite_token)
 * si no existe, le da acceso al deal y marca el contacto como customer. Idempotente.
 */
export async function activateClientPortal(tx: Tx, portalId: string, dealId: string): Promise<void> {
  const [d] = await tx.select().from(deal).where(eq(deal.id, dealId)).limit(1)
  if (!d?.primaryContactId) return
  const [c] = await tx.select().from(contact).where(eq(contact.id, d.primaryContactId)).limit(1)
  if (!c?.email) return

  let [account] = await tx
    .select()
    .from(clientAccount)
    .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, c.email)))
    .limit(1)
  if (!account) {
    ;[account] = await tx
      .insert(clientAccount)
      .values({ portalId, contactId: c.id, email: c.email, inviteToken: randomUUID(), inviteSentAt: new Date() })
      .returning()
  }

  await tx.insert(clientDealAccess).values({ clientId: account!.id, dealId }).onConflictDoNothing()
  if (c.lifecycleStage !== 'customer') {
    await tx.update(contact).set({ lifecycleStage: 'customer', updatedAt: new Date() }).where(eq(contact.id, c.id))
  }
  // TODO: asignar intake forms por defecto + enviar email de invitación (Resend) cuando estén configurados.
}

/**
 * Cambia el deal de etapa. Centraliza la lógica (NO actualizar stage_id suelto):
 * 1) update del deal  2) record_history  3) audit_log  4) notification
 * 5) si la etapa es is_won → (Fase 3) activar client portal.
 */
export async function changeStage(
  portalId: string,
  userId: string,
  dealId: string,
  newStageId: string,
): Promise<DealRow> {
  const result = await db.transaction(async (tx) => {
    const [d] = await tx
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.id, dealId), eq(deal.archived, false)))
      .limit(1)
    if (!d) throw Errors.notFound('Deal no encontrado')

    const stage = await assertStageInPipeline(tx, d.pipelineId, newStageId)
    if (d.stageId === newStageId) {
      return { deal: d, notify: null as null | { ownerId: string | null; dealName: string; stageLabel: string } }
    }

    const [updated] = await tx
      .update(deal)
      .set({ stageId: newStageId, updatedAt: new Date() })
      .where(eq(deal.id, dealId))
      .returning()
    if (!updated) throw Errors.internal('No se pudo cambiar la etapa')

    await recordFieldChanges({
      tx,
      portalId,
      entityType: ENTITY,
      entityId: dealId,
      before: { stageId: d.stageId },
      after: { stageId: newStageId },
      changedBy: userId,
    })
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: dealId,
      action: 'STAGE_CHANGE',
      payload: { from: d.stageId, to: newStageId },
    })
    // Si la etapa es ganada, activar el portal del cliente automáticamente.
    if (stage.isWon) await activateClientPortal(tx, portalId, dealId)
    return { deal: updated, notify: { ownerId: d.ownerId, dealName: d.name, stageLabel: stage.label } }
  })

  // Notificación fuera de la transacción (insert + emit por WebSocket).
  if (result.notify) {
    await createNotification({
      portalId,
      userId: result.notify.ownerId ?? userId,
      entityType: ENTITY,
      entityId: dealId,
      type: 'deal_stage_changed',
      title: `El deal "${result.notify.dealName}" pasó a la etapa "${result.notify.stageLabel}"`,
    })
  }
  return result.deal
}
