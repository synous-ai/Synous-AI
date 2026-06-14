import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  setterMessage,
} from '../../db/schema'
import { env } from '../../config/env'
import { evolutionProvider } from './channels/evolution.client'
import { getSetterInboundQueue } from './queue/setter.queue'
import { isRedisConfigured } from '../../jobs/connection'
import { syncLeadToCrm } from './setter.crm-sync.service'
import { logSetterEvent } from './setter.events.service'

/** Ventana de servicio de WhatsApp: 24h desde el último mensaje del lead. */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Mensaje entrante ya normalizado (agnóstico del canal). */
export interface NormalizedInbound {
  /** Teléfono del lead en E.164 (o jid sin sufijo). */
  from: string
  /** Nombre del contacto si el canal lo provee. */
  name?: string | null
  /** id del mensaje en el canal — clave de idempotencia. */
  messageId: string
  /** Texto del mensaje. */
  text: string
  /** Canal de origen. */
  channel?: string
}

export type InboundOutcome =
  | { status: 'duplicate' }
  | { status: 'opted_out'; leadId: string }
  | { status: 'skipped_opted_out' }
  | { status: 'processed'; leadId: string; conversationId: string }

/**
 * Resuelve el único tenant del setter (Sprint 0 es single-tenant interno).
 */
async function getSetterTenantId(): Promise<string | null> {
  const [tenant] = await db.select({ id: setterTenant.id }).from(setterTenant).limit(1)
  return tenant?.id ?? null
}

/**
 * Procesa un mensaje entrante: persiste, mantiene la ventana, aplica opt-out y
 * (si corresponde) encola el turno del agente. Todo en una transacción porque
 * toca varias tablas. NUNCA llama al LLM acá (guardrail: async total).
 *
 * Idempotente por `message_id`: si el webhook se reentrega, no duplica nada.
 */
export async function handleInboundMessage(input: NormalizedInbound): Promise<InboundOutcome> {
  const tenantId = await getSetterTenantId()
  if (!tenantId) {
    throw new Error('No hay setter_tenant. Corré: pnpm --filter api db:seed:setter')
  }

  const optedOutByKeyword = evolutionProvider.detectOptOut(input.text)

  const result = await db.transaction(async (tx): Promise<InboundOutcome> => {
    // 1. Person (idempotente por tenant+phone)
    await tx
      .insert(setterPerson)
      .values({ tenantId, name: input.name ?? null, phone: input.from })
      .onConflictDoNothing({ target: [setterPerson.tenantId, setterPerson.phone] })

    const [person] = await tx
      .select()
      .from(setterPerson)
      .where(and(eq(setterPerson.tenantId, tenantId), eq(setterPerson.phone, input.from)))
      .limit(1)

    // Guardrail no negociable: si ya optó por salir, no se procesa nada más.
    if (person!.optedOut) {
      return { status: 'skipped_opted_out' }
    }

    // 2. Conversación (una por persona; idempotente)
    await tx
      .insert(setterConversation)
      .values({ tenantId, personId: person!.id, channel: input.channel ?? 'whatsapp' })
      .onConflictDoNothing({ target: setterConversation.personId })

    const [conversation] = await tx
      .select()
      .from(setterConversation)
      .where(eq(setterConversation.personId, person!.id))
      .limit(1)

    // 3. Lead (si no hay uno para la persona, lo creo en NEW)
    let [lead] = await tx
      .select()
      .from(setterLead)
      .where(eq(setterLead.personId, person!.id))
      .limit(1)

    if (!lead) {
      ;[lead] = await tx
        .insert(setterLead)
        .values({ tenantId, personId: person!.id, status: 'NEW', source: input.channel ?? 'whatsapp' })
        .returning()
    }

    // 4. Persistir el mensaje entrante (dedup por message_id)
    const inserted = await tx
      .insert(setterMessage)
      .values({
        conversationId: conversation!.id,
        role: 'user',
        content: input.text,
        messageId: input.messageId,
      })
      .onConflictDoNothing({ target: setterMessage.messageId })
      .returning({ id: setterMessage.id })

    if (inserted.length === 0) {
      // El webhook se reentregó: ya teníamos este mensaje. No tocar nada.
      return { status: 'duplicate' }
    }

    // 5. Mantener viva la ventana de servicio (último msg del lead + 24h)
    await tx
      .update(setterLead)
      .set({ windowExpiresAt: new Date(Date.now() + SERVICE_WINDOW_MS) })
      .where(eq(setterLead.id, lead!.id))

    // 6. Opt-out: marca la persona y el lead, y NO encola (no se le genera nada).
    if (optedOutByKeyword) {
      await tx
        .update(setterPerson)
        .set({ optedOut: true, optedOutAt: new Date() })
        .where(eq(setterPerson.id, person!.id))
      await tx
        .update(setterLead)
        .set({ status: 'OPTED_OUT' })
        .where(eq(setterLead.id, lead!.id))
      return { status: 'opted_out', leadId: lead!.id }
    }

    return { status: 'processed', leadId: lead!.id, conversationId: conversation!.id }
  })

  // Consola: registrar la actividad.
  if (result.status === 'processed') {
    void logSetterEvent({
      tenantId,
      type: 'inbound',
      message: `Entró mensaje de ${input.from}`,
      leadId: result.leadId,
      meta: { messageId: input.messageId },
    })
  } else if (result.status === 'opted_out') {
    void logSetterEvent({
      tenantId,
      level: 'warn',
      type: 'optout',
      message: `Opt-out de ${input.from} — no se le genera ni envía nada más`,
      leadId: result.leadId,
    })
  }

  // 7. Encolar el turno del agente fuera de la transacción (idempotente por jobId).
  //    En test NO se encola: evita contaminar el Redis compartido con jobs cuyo
  //    lead vive solo en la DB de test (y que un worker de dev tomaría y fallaría).
  if (result.status === 'processed' && isRedisConfigured() && env.NODE_ENV !== 'test') {
    await getSetterInboundQueue().add(
      'handle-message',
      { leadId: result.leadId, conversationId: result.conversationId, messageId: input.messageId },
      { jobId: input.messageId, removeOnComplete: true, removeOnFail: 100 },
    )
  }

  // Si optó por salir y ya tenía un contacto en el CRM, lo marcamos (lifecycle
  // 'other'). No crea contacto nuevo para opt-outs (solo actualiza si existe).
  if (result.status === 'opted_out' && env.NODE_ENV !== 'test') {
    try {
      await syncLeadToCrm(result.leadId)
    } catch (err) {
      console.error('[setter] sync CRM opt-out falló:', err)
    }
  }

  return result
}
