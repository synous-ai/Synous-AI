import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { deal, pipeline, pipelineStage, contact, clientAccount, clientDealAccess } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { createNotification } from '../notifications/notifications.service'
import { ensureClerkUserType } from '../../lib/clerk-provisioning'
import { sendEmail } from '../../lib/mailer'
import { portalLoginUrl } from '../../lib/portal-url'
import { portalWelcomeHtml, portalWelcomeSubject } from './emails/portal-welcome'
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
 * Email de bienvenida pendiente de envío, devuelto por `activateClientPortal`.
 *
 * La activación corre DENTRO de una transacción, y mandar el email ahí adentro
 * sería un bug: si la transacción hace rollback, el email ya salió y el cliente
 * recibe un link a un portal cuya cuenta no existe. Por eso la función no manda
 * nada — describe el envío y el caller lo dispara después del commit, igual que
 * `changeStage` ya hace con `createNotification`.
 */
export interface PendingPortalWelcome {
  email: string
  firstName: string | null
  dealName: string
  brandSlug: string | null
  clientAccountId: string
}

/**
 * Activa el portal del cliente al ganar un deal: crea client_account (con invite_token)
 * si no existe, le da acceso al deal y marca el contacto como customer. Idempotente.
 *
 * @returns el email de bienvenida a enviar si se creó la cuenta en esta llamada,
 *          o `null` si no había a quién avisarle o la cuenta ya existía (la
 *          idempotencia de la activación se extiende al email: se manda UNA vez).
 */
export async function activateClientPortal(
  tx: Tx,
  portalId: string,
  dealId: string,
): Promise<PendingPortalWelcome | null> {
  const [d] = await tx.select().from(deal).where(eq(deal.id, dealId)).limit(1)
  if (!d?.primaryContactId) return null
  const [c] = await tx.select().from(contact).where(eq(contact.id, d.primaryContactId)).limit(1)
  if (!c?.email) return null

  let [account] = await tx
    .select()
    .from(clientAccount)
    .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, c.email)))
    .limit(1)
  // `isNewAccount` decide si corresponde el email de bienvenida: si la cuenta ya
  // existía, el cliente ya fue invitado antes y no hay que volver a avisarle.
  const isNewAccount = !account
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

  if (!isNewAccount || !account) return null
  return {
    email: c.email,
    firstName: c.firstName,
    dealName: d.name,
    brandSlug: account.brandSlug,
    clientAccountId: account.id,
  }
}

/**
 * Manda el email de bienvenida al portal y recién ahí marca `inviteSentAt`.
 *
 * Best-effort y SIEMPRE fuera de la transacción de activación: si el envío
 * falla, el cliente ya tiene la cuenta y el acceso creados — se loguea y sigue.
 * `inviteSentAt` solo se escribe si `sendEmail` no tiró, para que la columna
 * refleje envíos reales.
 */
export async function sendPortalWelcome(pending: PendingPortalWelcome): Promise<void> {
  try {
    await sendEmail({
      to: pending.email,
      subject: portalWelcomeSubject(pending.dealName),
      html: portalWelcomeHtml({
        firstName: pending.firstName,
        dealName: pending.dealName,
        email: pending.email,
        loginUrl: portalLoginUrl(pending.brandSlug),
      }),
    })
    await db.update(clientAccount).set({ inviteSentAt: new Date() }).where(eq(clientAccount.id, pending.clientAccountId))
  } catch (err) {
    console.error('[stage.service] No se pudo enviar el email de bienvenida al portal', {
      clientAccountId: pending.clientAccountId,
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
      return { status: 'missing_contact' as const, clientEmail: null, welcome: null }
    }
    const [c] = await tx.select().from(contact).where(eq(contact.id, d.primaryContactId)).limit(1)
    if (!c?.email) {
      return { status: 'missing_email' as const, clientEmail: null, welcome: null }
    }

    const welcome = await activateClientPortal(tx, portalId, dealId)
    if (!welcome) {
      // Ya validamos contacto + email arriba: si igual no hay bienvenida
      // pendiente, es porque la cuenta ya existía (ver comentario del JSDoc).
      return { status: 'already_active' as const, clientEmail: c.email, welcome: null }
    }

    // Auditar la activación manual solo cuando efectivamente activa algo nuevo
    // (no en cada click sobre un deal ya activado) — mismo criterio que evita
    // re-mandar el email de bienvenida.
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: dealId,
      action: 'CLIENT_PORTAL_ACTIVATED',
      payload: { clientEmail: c.email },
    })

    return { status: 'activated' as const, clientEmail: c.email, welcome }
  })

  // Igual que en changeStage: el email sale DESPUÉS del commit. Si la tx
  // hubiera hecho rollback, no queremos haber mandado ya la invitación.
  if (result.welcome) await sendPortalWelcome(result.welcome)

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
    // El email de bienvenida NO se manda acá: sale después del commit.
    const welcome = stage.isWon ? await activateClientPortal(tx, portalId, dealId) : null
    // Notificar al owner FINAL (el reasignado si lo hubo; si no, sigue siendo
    // el mismo que ya tenía el deal — nunca al viejo owner pre-reasignación).
    return {
      deal: finalDeal,
      welcome,
      notify: { ownerId: finalDeal.ownerId, dealName: d.name, stageLabel: stage.label },
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
  // Bienvenida al portal, también fuera de la transacción y best-effort.
  if (result.welcome) await sendPortalWelcome(result.welcome)
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
