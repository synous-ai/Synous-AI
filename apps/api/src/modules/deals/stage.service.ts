import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { deal, pipeline, pipelineStage, contact, clientAccount, clientDealAccess } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { notifyUser } from '../notifications/notify'
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
  /**
   * Id de la cuenta recién creada. No lo usa `changeStage`, pero
   * `activateClientPortalManually` lo necesita para sellar `inviteSentAt`
   * DESPUÉS de que el envío ocurre de verdad (ver `sendPortalInvitationEmail`)
   * — sin esto tendría que volver a consultar la cuenta por email.
   */
  clientAccountId: string
}

/**
 * Lo que queda pendiente de una activación una vez commiteada la transacción:
 * todo lo que habla con Clerk y el email de invitación.
 */
export interface PortalActivation {
  clientAccountId: string
  email: string
  firstName: string | null
  lastName: string | null
  dealName: string
  /** La cuenta se creó en esta activación: es la única vez que se invita. */
  isNewAccount: boolean
  /** La cuenta todavía no está vinculada a un usuario de Clerk (primera vez, o un intento previo falló). */
  needsClerkUser: boolean
}

/**
 * Activa el portal del cliente al ganar un deal: crea client_account (con invite_token)
 * si no existe, le da acceso al deal y marca el contacto como customer. Idempotente.
 *
 * Hace SOLO trabajo de base de datos. Las llamadas a Clerk y el email las
 * ejecuta `completeClientPortalActivation` después del commit: hacerlas acá
 * retenía los locks de deal/contact/client_account durante un round-trip HTTP
 * (con Clerk lento, se agota el pool) y, si la transacción hacía rollback, el
 * usuario de Clerk quedaba creado igual.
 *
 * Devuelve `null` cuando no queda nada por hacer: sin contacto/email, o cuenta
 * preexistente ya vinculada a Clerk (no se re-invita a quien ya entró).
 */
export async function activateClientPortal(
  tx: Tx,
  portalId: string,
  dealId: string,
): Promise<PortalActivation | null> {
  const [d] = await tx
    .select()
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId)))
    .limit(1)
  if (!d?.primaryContactId) return null
  const [c] = await tx
    .select()
    .from(contact)
    .where(and(eq(contact.id, d.primaryContactId), eq(contact.portalId, portalId)))
    .limit(1)
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
      // `inviteSentAt` se setea recién cuando el email se manda de verdad (lo hace
      // el caller). Antes se seteaba acá, con lo cual la columna afirmaba haber
      // mandado una invitación que nunca salía.
      .values({ portalId, contactId: c.id, email: c.email, inviteToken: randomUUID() })
      .returning()
  }

  await tx.insert(clientDealAccess).values({ clientId: account!.id, dealId }).onConflictDoNothing()
  if (c.lifecycleStage !== 'customer') {
    await tx.update(contact).set({ lifecycleStage: 'customer', updatedAt: new Date() }).where(eq(contact.id, c.id))
  }

  const isNewAccount = !existing
  const needsClerkUser = !account!.clerkUserId
  if (!isNewAccount && !needsClerkUser) return null
  return {
    clientAccountId: account!.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    dealName: d.name,
    isNewAccount,
    needsClerkUser,
  }
}

/**
 * Segunda mitad de la activación, SIEMPRE después del commit y best-effort: si
 * Clerk o Resend fallan, la cuenta y el acceso ya existen y se loguea. Una
 * activación posterior (p. ej. el botón manual del admin) reintenta el vínculo
 * con Clerk porque `needsClerkUser` sigue en true.
 */
export async function completeClientPortalActivation(activation: PortalActivation): Promise<void> {
  try {
    // La invitación va ANTES de ensureClerkUserType: Clerk rechaza invitar a un
    // email que ya es usuario de la aplicación, y ensureClerkUserType lo crea.
    // Solo en la activación real: a quien ya entró no se le re-invita.
    let invitationUrl: string | null = null
    if (activation.isNewAccount) {
      const invitation = await createClientPortalInvitation({
        email: activation.email,
        redirectUrl: `${clientPortalBaseUrl()}/portal/accept-invitation`,
      })
      invitationUrl = invitation?.invitationUrl ?? null
    }

    if (activation.needsClerkUser) {
      const clerkUserId = await ensureClerkUserType({
        email: activation.email,
        firstName: activation.firstName,
        lastName: activation.lastName,
        userType: 'client',
      })
      if (clerkUserId) {
        await db
          .update(clientAccount)
          .set({ clerkUserId })
          .where(and(eq(clientAccount.id, activation.clientAccountId), isNull(clientAccount.clerkUserId)))
      }
    }

    if (activation.isNewAccount) {
      await sendPortalInvitationEmail({
        email: activation.email,
        firstName: activation.firstName,
        dealName: activation.dealName,
        invitationUrl,
        clientAccountId: activation.clientAccountId,
      })
    }
  } catch (err) {
    console.error('[stage.service] No se pudo completar la activación del portal en Clerk', {
      clientAccountId: activation.clientAccountId,
      error: (err as Error)?.message ?? err,
    })
  }
}

/**
 * Manda el email de invitación al portal y, si el envío ocurrió de verdad,
 * recién ahí marca `inviteSentAt`.
 *
 * Best-effort y SIEMPRE fuera de la transacción de activación: si algo falla
 * acá, el cliente ya tiene la cuenta y el acceso creados — se loguea y sigue
 * (mismo criterio que ya usaba el flujo viejo de bienvenida).
 *
 * Si Clerk no devolvió link de invitación (usuario preexistente, Clerk caído,
 * sin secret key) no se manda nada: un email cuyo botón no lleva a ningún
 * lado es peor que no mandarlo (mismo razonamiento que ya aplica `changeStage`
 * para su propio envío).
 */
export async function sendPortalInvitationEmail(invitation: PortalInvitationPayload): Promise<void> {
  if (!invitation.invitationUrl) return
  try {
    await sendEmail({
      to: invitation.email,
      subject: `Tu portal de ${invitation.dealName} ya está listo`,
      html: portalInvitationHtml({
        firstName: invitation.firstName,
        dealName: invitation.dealName,
        portalUrl: invitation.invitationUrl,
      }),
    })
    await db.update(clientAccount).set({ inviteSentAt: new Date() }).where(eq(clientAccount.id, invitation.clientAccountId))
  } catch (err) {
    console.error('[stage.service] No se pudo enviar el email de invitación al portal', {
      clientAccountId: invitation.clientAccountId,
      error: (err as Error)?.message ?? err,
    })
  }
}

/** Estados de negocio posibles al invitar manualmente a un deal al Client Portal. */
export type ActivatePortalStatus = 'activated' | 'already_active' | 'missing_contact' | 'missing_email'

export interface ActivatePortalResultDTO {
  status: ActivatePortalStatus
  /** Email del contacto principal, o `null` si todavía no hay a quién invitar. */
  clientEmail: string | null
}

/**
 * Invitación MANUAL al Client Portal desde el detalle del deal (Fase B del
 * multi-tenant). A diferencia de `changeStage` (stage `is_won`) y del webhook
 * de DocuSeal (`form.completed`), acá el disparador es un admin apretando un
 * botón — no hay stage de por medio.
 *
 * `missing_contact` / `missing_email` / `already_active` son resultados de
 * negocio ESPERABLES (no hay nada roto), por eso la función nunca lanza
 * AppError para esos casos — solo si el deal no existe en el portal.
 *
 * Para distinguir `already_active` de `activated`: como acá YA validamos que
 * el deal tiene `primaryContactId` y que el contacto tiene `email` (los dos
 * únicos motivos por los que `activateClientPortal` devolvería `null` sin
 * haber hecho nada), si igual devuelve `null` solo puede ser porque el
 * `client_account` ya existía — la misma idempotencia que ya usa
 * `changeStage`/DocuSeal para no reinvitar. No hace falta un chequeo previo
 * aparte: el propio contrato de `activateClientPortal` alcanza.
 */
export async function activateClientPortalManually(
  portalId: string,
  userId: string,
  dealId: string,
): Promise<ActivatePortalResultDTO> {
  const result = await db.transaction(async (tx) => {
    const [d] = await tx
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.id, dealId), eq(deal.archived, false)))
      .limit(1)
    if (!d) throw Errors.notFound('Deal no encontrado')

    if (!d.primaryContactId) {
      return { status: 'missing_contact' as const, clientEmail: null, activation: null }
    }
    const [c] = await tx.select().from(contact).where(eq(contact.id, d.primaryContactId)).limit(1)
    if (!c?.email) {
      return { status: 'missing_email' as const, clientEmail: null, activation: null }
    }

    const activation = await activateClientPortal(tx, portalId, dealId)
    if (!activation?.isNewAccount) {
      // Ya validamos contacto + email arriba: si la cuenta no es nueva, ya
      // existía. Igual se devuelve la activación para reintentar el vínculo
      // con Clerk si el intento anterior había fallado.
      return { status: 'already_active' as const, clientEmail: c.email, activation }
    }

    // Auditar la activación manual solo cuando efectivamente activa algo nuevo
    // (no en cada click sobre un deal ya activado) — mismo criterio que evita
    // re-mandar la invitación.
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: dealId,
      action: 'CLIENT_PORTAL_ACTIVATED',
      payload: { clientEmail: c.email },
    })

    return { status: 'activated' as const, clientEmail: c.email, activation }
  })

  // Igual que en changeStage: Clerk y el email van DESPUÉS del commit. Si la tx
  // hubiera hecho rollback, no queremos haber creado el usuario ni invitado.
  if (result.activation) await completeClientPortalActivation(result.activation)

  return { status: result.status, clientEmail: result.clientEmail }
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
        activation: null as PortalActivation | null,
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
    // El email de invitación NO se manda acá: sale después del commit.
    const activation = stage.isWon ? await activateClientPortal(tx, portalId, dealId) : null
    // Notificar al owner FINAL (el reasignado si lo hubo; si no, sigue siendo
    // el mismo que ya tenía el deal — nunca al viejo owner pre-reasignación).
    return {
      deal: finalDeal,
      notify: { ownerId: finalDeal.ownerId, dealName: d.name, stageLabel: stage.label },
      activation,
    }
  })

  // Notificación fuera de la transacción (insert + emit por WebSocket).
  if (result.notify) {
    await notifyUser(portalId, result.notify.ownerId ?? userId, 'deal_stage_changed', {
      dealId,
      dealName: result.notify.dealName,
      stageLabel: result.notify.stageLabel,
    }, { entity: { type: ENTITY, id: dealId } })
  }

  // Clerk + invitación al portal, ya con la transacción commiteada y best-effort
  // (ver `completeClientPortalActivation`).
  if (result.activation) await completeClientPortalActivation(result.activation)
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
