import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { deal, pipeline, pipelineStage, contact, clientAccount, clientDealAccess } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { createNotification } from '../notifications/notifications.service'
import { ensureClerkUserType, createClientPortalInvitation } from '../../lib/clerk-provisioning'
import { sendEmail, clientPortalBaseUrl } from '../../lib/mailer'
import { portalInvitationHtml } from '../onboarding/emails/portal-invitation'
import {
  PRODUCTION_PIPELINE_LABEL,
  PRODUCTION_DIAGNOSTICO_STAGE_LABEL,
  resolveProductionAssignee,
} from '../onboarding/assignees'

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
 * Datos para el email de invitación al portal. `activateClientPortal` lo
 * devuelve en vez de enviar el email inline: el envío es una llamada de red y
 * corre DENTRO de la transacción del cambio de etapa — mandarlo acá retendría
 * el lock de la fila del deal mientras Resend responde. El caller lo envía
 * después del commit (ver `changeStage`).
 */
export interface PortalInvitationPayload {
  email: string
  firstName: string | null
  dealName: string
  /** Link de Clerk con ticket; `null` si no se pudo invitar (ver abajo). */
  invitationUrl: string | null
}

/**
 * Activa el portal del cliente al ganar un deal: crea client_account (con invite_token)
 * si no existe, le da acceso al deal y marca el contacto como customer. Idempotente.
 *
 * Devuelve los datos del email de invitación SOLO la primera vez que se crea la
 * cuenta (activación real). En las re-ejecuciones idempotentes devuelve `null`
 * para no re-invitar a un cliente que ya entró al portal.
 */
export async function activateClientPortal(
  tx: Tx,
  portalId: string,
  dealId: string,
): Promise<PortalInvitationPayload | null> {
  const [d] = await tx.select().from(deal).where(eq(deal.id, dealId)).limit(1)
  if (!d?.primaryContactId) return null
  const [c] = await tx.select().from(contact).where(eq(contact.id, d.primaryContactId)).limit(1)
  if (!c?.email) return null

  const [existing] = await tx
    .select()
    .from(clientAccount)
    .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, c.email)))
    .limit(1)

  let account = existing
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

  // La invitación va ANTES de ensureClerkUserType: Clerk rechaza invitar a un
  // email que ya es usuario de la aplicación, y ensureClerkUserType lo crea.
  // Solo se invita en la activación real (cuenta recién creada) — reejecutar
  // esto sobre un cliente que ya entró le mandaría un link de activación de
  // una cuenta que ya activó.
  let invitationUrl: string | null = null
  if (!existing) {
    const invitation = await createClientPortalInvitation({
      email: c.email,
      redirectUrl: `${clientPortalBaseUrl()}/portal/accept-invitation`,
    })
    invitationUrl = invitation?.invitationUrl ?? null
  }

  // Provisionar el cliente en Clerk con userType='client' + linkear clerkUserId (si falta).
  // Best-effort: si Clerk falla, no rompe la activación del portal (el account ya quedó creado).
  if (account && !account.clerkUserId) {
    const clerkUserId = await ensureClerkUserType({
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      userType: 'client',
    })
    if (clerkUserId) {
      await tx.update(clientAccount).set({ clerkUserId }).where(eq(clientAccount.id, account.id))
    }
  }
  // TODO: asignar intake forms por defecto cuando estén configurados.

  if (existing) return null
  return { email: c.email, firstName: c.firstName, dealName: d.name, invitationUrl }
}

/**
 * Resuelve si corresponde reasignar el owner de un deal en el pipeline
 * "Producción" al entrar a `stageLabel`: consulta resolveProductionAssignee y
 * compara contra el owner actual. Devuelve el nuevo ownerId SOLO si hay una
 * reasignación real (el helper resolvió a alguien Y es distinto al actual);
 * si no, devuelve `null` — el caller no debe pisar el ownerId.
 *
 * No escribe en DB: cada caller aplica el update a su manera (`changeStage`
 * hace un UPDATE dedicado tras el cambio de stage; `moveDealToProduction` lo
 * combina en el UPDATE único que también cambia pipelineId/stageId).
 *
 * Recibe `tx` explícito (no `db` global) — ambos callers corren dentro de una
 * transacción; resolver el assignee con una conexión aparte del pool mientras
 * la tx retiene la suya arriesga agotar el pool (serverless/pools chicos).
 */
async function reassignProductionOwner(
  tx: Tx,
  portalId: string,
  stageLabel: string,
  currentOwnerId: string | null,
): Promise<string | null> {
  const newOwnerId = await resolveProductionAssignee(tx, portalId, stageLabel)
  if (!newOwnerId || newOwnerId === currentOwnerId) return null
  return newOwnerId
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
    const [row] = await tx
      .select({ deal, pipelineLabel: pipeline.label })
      .from(deal)
      .innerJoin(pipeline, eq(pipeline.id, deal.pipelineId))
      .where(and(eq(deal.portalId, portalId), eq(deal.id, dealId), eq(deal.archived, false)))
      .limit(1)
    if (!row) throw Errors.notFound('Deal no encontrado')
    const { deal: d, pipelineLabel } = row

    const stage = await assertStageInPipeline(tx, d.pipelineId, newStageId)
    if (d.stageId === newStageId) {
      return {
        deal: d,
        notify: null as null | { ownerId: string | null; dealName: string; stageLabel: string },
        invitation: null as PortalInvitationPayload | null,
      }
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

    // Reasignación automática por fase: si el deal está en el pipeline
    // "Producción", el responsable se resuelve por la fase (Diagnóstico → Lauri;
    // cualquier otra fase → Jeremías, vía el helper de assignees.ts). No pisa el
    // owner si el helper no resuelve a nadie (email no seedeado).
    let finalDeal = updated
    if (pipelineLabel === PRODUCTION_PIPELINE_LABEL) {
      const newOwnerId = await reassignProductionOwner(tx, portalId, stage.label, updated.ownerId)
      if (newOwnerId) {
        const [reassigned] = await tx
          .update(deal)
          .set({ ownerId: newOwnerId, updatedAt: new Date() })
          .where(eq(deal.id, dealId))
          .returning()
        if (reassigned) {
          finalDeal = reassigned
          await recordFieldChanges({
            tx,
            portalId,
            entityType: ENTITY,
            entityId: dealId,
            before: { ownerId: updated.ownerId },
            after: { ownerId: newOwnerId },
            changedBy: userId,
          })
        }
      }
    }

    // Si la etapa es ganada, activar el portal del cliente automáticamente.
    const invitation = stage.isWon ? await activateClientPortal(tx, portalId, dealId) : null
    // Notificar al owner FINAL (el reasignado si lo hubo; si no, sigue siendo
    // el mismo que ya tenía el deal — nunca al viejo owner pre-reasignación).
    return {
      deal: finalDeal,
      notify: { ownerId: finalDeal.ownerId, dealName: d.name, stageLabel: stage.label },
      invitation,
    }
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

  // Email de invitación al portal, ya con la transacción commiteada. Si Clerk no
  // devolvió link de invitación (usuario preexistente, Clerk caído, sin secret
  // key), no mandamos un email cuyo botón no llevaría a ningún lado: el cliente
  // recibiría "activá tu cuenta" sin poder hacerlo.
  if (result.invitation?.invitationUrl) {
    await sendEmail({
      to: result.invitation.email,
      subject: `Tu portal de ${result.invitation.dealName} ya está listo`,
      html: portalInvitationHtml({
        firstName: result.invitation.firstName,
        dealName: result.invitation.dealName,
        portalUrl: result.invitation.invitationUrl,
      }),
    })
  }
  return result.deal
}

export interface MoveDealToProductionResultDTO {
  ownerId: string | null
  dealName: string
  stageLabel: string
}

/**
 * Mueve un deal al pipeline "Producción", etapa "Diagnóstico" — el disparador
 * es completar el onboarding post-venta (client-onboarding). A diferencia de
 * `changeStage`, ESTE cambia de pipeline (no valida que el stage pertenezca al
 * pipeline actual del deal — justo lo contrario). Actualiza pipelineId +
 * stageId + ownerId (si se resolvió un responsable) en la MISMA transacción
 * que le pasa el caller, con su record_history + audit_log, siguiendo el mismo
 * patrón que changeStage.
 *
 * `actor` es `{ userId }` o `{ clientId }` — el completar el onboarding lo
 * origina el CLIENTE, no un hub_user, así que `changed_by`/`audit_log.userId`
 * quedan en null y se deja constancia en `audit_log.clientId`.
 */
export async function moveDealToProduction(
  tx: Tx,
  portalId: string,
  dealId: string,
  actor: { userId?: string | null; clientId?: string | null },
): Promise<MoveDealToProductionResultDTO> {
  const [pl] = await tx
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, PRODUCTION_PIPELINE_LABEL)))
    .limit(1)
  if (!pl) throw Errors.internal('Pipeline "Producción" no seedeado en este portal')

  const [stage] = await tx
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, pl.id), eq(pipelineStage.label, PRODUCTION_DIAGNOSTICO_STAGE_LABEL)))
    .limit(1)
  if (!stage) throw Errors.internal('Stage "Diagnóstico" no seedeado en el pipeline Producción')

  const [d] = await tx
    .select()
    .from(deal)
    .where(and(eq(deal.portalId, portalId), eq(deal.id, dealId), eq(deal.archived, false)))
    .limit(1)
  if (!d) throw Errors.notFound('Deal no encontrado')

  const resolvedOwnerId = await reassignProductionOwner(tx, portalId, stage.label, d.ownerId)
  const finalOwnerId = resolvedOwnerId ?? d.ownerId

  const [updated] = await tx
    .update(deal)
    .set({
      pipelineId: pl.id,
      stageId: stage.id,
      ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(deal.id, dealId))
    .returning()
  if (!updated) throw Errors.internal('No se pudo mover el deal a Producción')

  await recordFieldChanges({
    tx,
    portalId,
    entityType: ENTITY,
    entityId: dealId,
    before: { pipelineId: d.pipelineId, stageId: d.stageId, ownerId: d.ownerId },
    after: { pipelineId: pl.id, stageId: stage.id, ownerId: finalOwnerId },
    changedBy: actor.userId ?? null,
  })
  await writeAudit({
    tx,
    portalId,
    userId: actor.userId ?? null,
    clientId: actor.clientId ?? null,
    entityType: ENTITY,
    entityId: dealId,
    action: 'STAGE_CHANGE',
    payload: { from: d.stageId, to: stage.id, pipelineFrom: d.pipelineId, pipelineTo: pl.id },
  })
  await writeAudit({
    tx,
    portalId,
    userId: actor.userId ?? null,
    clientId: actor.clientId ?? null,
    entityType: ENTITY,
    entityId: dealId,
    action: 'ONBOARDING_COMPLETED',
    payload: { dealId },
  })

  return { ownerId: finalOwnerId, dealName: d.name, stageLabel: stage.label }
}
