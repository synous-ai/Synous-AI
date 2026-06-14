import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  setterDraft,
  setterLead,
  setterPerson,
  setterConversation,
  setterTenant,
  setterMessage,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { evolutionProvider } from './channels/evolution.client'
import { splitIntoBubbles } from './channels/evolution.client'
import { runAgentTurn } from './agent/brain'
import { logSetterEvent } from './setter.events.service'
import { notifyAdmins, actorName } from '../notifications/notifications.service'

/**
 * Cola de aprobación del setter (shadow mode). Todo scopeado por `portalId`
 * (el setter es interno del admin). Aprobar/editar envía vía Evolution; si no
 * hay creds, el mensaje se persiste y el draft queda `approved` (envío diferido).
 */

export interface DraftListItem {
  id: string
  tenantId: string
  content: string
  editedContent: string | null
  beat: string | null
  format: string
  status: string
  toolCalls: Record<string, unknown> | null
  createdAt: Date
  leadId: string
  leadStatus: string
  qualification: Record<string, unknown> | null
  conversationId: string
  channel: string
  personName: string | null
  personPhone: string | null
  crmContactId: string | null
  crmDealId: string | null
}

const DRAFT_COLUMNS = {
  id: setterDraft.id,
  tenantId: setterDraft.tenantId,
  content: setterDraft.content,
  editedContent: setterDraft.editedContent,
  beat: setterDraft.beat,
  format: setterDraft.format,
  status: setterDraft.status,
  toolCalls: setterDraft.toolCalls,
  createdAt: setterDraft.createdAt,
  leadId: setterDraft.leadId,
  leadStatus: setterLead.status,
  qualification: setterLead.qualification,
  conversationId: setterDraft.conversationId,
  channel: setterConversation.channel,
  personName: setterPerson.name,
  personPhone: setterPerson.phone,
  crmContactId: setterPerson.crmContactId,
  crmDealId: setterLead.crmDealId,
}

function baseQuery() {
  return db
    .select(DRAFT_COLUMNS)
    .from(setterDraft)
    .innerJoin(setterTenant, eq(setterDraft.tenantId, setterTenant.id))
    .innerJoin(setterLead, eq(setterDraft.leadId, setterLead.id))
    .innerJoin(setterConversation, eq(setterDraft.conversationId, setterConversation.id))
    .innerJoin(setterPerson, eq(setterLead.personId, setterPerson.id))
    .$dynamic()
}

/** Lista los drafts del portal por estado (default pending), más viejos primero. */
export async function listDrafts(portalId: string, status: string): Promise<DraftListItem[]> {
  return baseQuery()
    .where(and(eq(setterTenant.portalId, portalId), eq(setterDraft.status, status)))
    .orderBy(asc(setterDraft.createdAt)) as Promise<DraftListItem[]>
}

export interface DraftDetail extends DraftListItem {
  messages: { role: string; content: string; beat: string | null; createdAt: Date }[]
}

/** Detalle de un draft + el historial de la conversación (para la Bandeja). */
export async function getDraftDetail(portalId: string, id: string): Promise<DraftDetail> {
  const [draft] = (await baseQuery().where(
    and(eq(setterTenant.portalId, portalId), eq(setterDraft.id, id)),
  )) as DraftListItem[]
  if (!draft) throw Errors.notFound('Draft no encontrado')

  const messages = await db
    .select({
      role: setterMessage.role,
      content: setterMessage.content,
      beat: setterMessage.beat,
      createdAt: setterMessage.createdAt,
    })
    .from(setterMessage)
    .where(eq(setterMessage.conversationId, draft.conversationId))
    .orderBy(asc(setterMessage.createdAt))

  return { ...draft, messages }
}

/** Carga un draft del portal validando pertenencia. Lanza 404 si no existe. */
async function loadDraft(portalId: string, id: string): Promise<DraftListItem> {
  const [draft] = (await baseQuery().where(
    and(eq(setterTenant.portalId, portalId), eq(setterDraft.id, id)),
  )) as DraftListItem[]
  if (!draft) throw Errors.notFound('Draft no encontrado')
  return draft
}

export interface SendResult {
  id: string
  status: string
  sent: boolean
  messageId: string
}

/**
 * Persiste el mensaje saliente, intenta enviarlo por Evolution y finaliza el
 * draft. Si Evolution no está configurado, el draft queda `approved` (envío
 * diferido) — nunca se pierde el contenido aprobado.
 */
async function sendAndFinalize(
  draft: DraftListItem,
  finalContent: string,
  userId: string,
  edited: boolean,
): Promise<SendResult> {
  if (draft.status !== 'pending') {
    throw Errors.conflict(`El draft ya está en estado "${draft.status}"`)
  }
  if (!draft.personPhone) {
    throw Errors.badRequest('La persona no tiene teléfono — no se puede enviar')
  }

  // Mensaje saliente (se persiste recién al aprobar; en shadow no existía antes).
  const [msg] = await db
    .insert(setterMessage)
    .values({
      conversationId: draft.conversationId,
      role: 'assistant',
      content: finalContent,
      beat: draft.beat,
    })
    .returning({ id: setterMessage.id })

  let sent = false
  if (evolutionProvider.isConfigured()) {
    try {
      await evolutionProvider.sendSplitMessages(draft.personPhone, splitIntoBubbles(finalContent))
      sent = true
    } catch {
      sent = false // envío falló; queda como approved para reintentar
    }
  }

  const status = sent ? (edited ? 'edited' : 'sent') : 'approved'
  await db
    .update(setterDraft)
    .set({
      status,
      editedContent: edited ? finalContent : null,
      sentMessageId: msg!.id,
      approvedBy: userId,
    })
    .where(eq(setterDraft.id, draft.id))

  void logSetterEvent({
    tenantId: draft.tenantId,
    level: 'success',
    type: 'approval',
    message: sent
      ? `${edited ? 'Editado y enviado' : 'Aprobado y enviado'} a ${draft.personPhone ?? 'lead'}`
      : `${edited ? 'Editado' : 'Aprobado'} (envío pendiente: Evolution sin credenciales)`,
    leadId: draft.leadId,
  })

  return { id: draft.id, status, sent, messageId: msg!.id }
}

/** Aprueba y envía el draft tal cual. */
export async function approveDraft(
  portalId: string,
  userId: string,
  id: string,
): Promise<SendResult> {
  const draft = await loadDraft(portalId, id)
  const result = await sendAndFinalize(draft, draft.content, userId, false)

  // Notificación post-commit: avisamos a los demás admins que se aprobó un mensaje.
  const who = await actorName(portalId, userId)
  await notifyAdmins(
    portalId,
    {
      entityType: 'setter_draft',
      entityId: id,
      type: 'setter_draft_approved',
      title: `${who} aprobó un mensaje del setter`,
      body: draft.personName ? `Para «${draft.personName}»` : null,
      actionUrl: '/admin/setter',
    },
    { exceptUserId: userId },
  )

  return result
}

/** Edita el contenido y lo envía. */
export async function editAndSendDraft(
  portalId: string,
  userId: string,
  id: string,
  content: string,
): Promise<SendResult> {
  const draft = await loadDraft(portalId, id)
  const result = await sendAndFinalize(draft, content, userId, true)

  // Notificación post-commit: avisamos a los demás admins que se editó y envió.
  const who = await actorName(portalId, userId)
  await notifyAdmins(
    portalId,
    {
      entityType: 'setter_draft',
      entityId: id,
      type: 'setter_draft_edited',
      title: `${who} editó y envió un mensaje del setter`,
      body: draft.personName ? `Para «${draft.personName}»` : null,
      actionUrl: '/admin/setter',
    },
    { exceptUserId: userId },
  )

  return result
}

/** Rechaza el draft (no envía nada). */
export async function rejectDraft(portalId: string, userId: string, id: string): Promise<{ id: string; status: string }> {
  const draft = await loadDraft(portalId, id)
  if (draft.status !== 'pending') {
    throw Errors.conflict(`El draft ya está en estado "${draft.status}"`)
  }
  await db.update(setterDraft).set({ status: 'rejected' }).where(eq(setterDraft.id, id))
  void logSetterEvent({
    tenantId: draft.tenantId,
    type: 'approval',
    message: 'Draft rechazado',
    leadId: draft.leadId,
  })

  // Notificación post-commit: avisamos a los demás admins que se rechazó un borrador.
  const who = await actorName(portalId, userId)
  await notifyAdmins(
    portalId,
    {
      entityType: 'setter_draft',
      entityId: id,
      type: 'setter_draft_rejected',
      title: `${who} rechazó un mensaje del setter`,
      body: draft.personName ? `Para «${draft.personName}»` : null,
      actionUrl: '/admin/setter',
    },
    { exceptUserId: userId },
  )

  return { id, status: 'rejected' }
}

/**
 * Rechaza el draft actual y re-corre el cerebro para generar uno nuevo.
 * (Corre Gemini real.)
 */
export async function regenerateDraft(portalId: string, id: string): Promise<DraftDetail> {
  const draft = await loadDraft(portalId, id)
  await db.update(setterDraft).set({ status: 'rejected' }).where(eq(setterDraft.id, id))
  const result = await runAgentTurn(draft.leadId)
  if (!result.draftId) {
    throw Errors.conflict('No se generó un nuevo draft (lead en opt-out o sin texto)')
  }
  return getDraftDetail(portalId, result.draftId)
}
