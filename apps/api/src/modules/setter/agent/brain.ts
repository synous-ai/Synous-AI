import type { Content } from '@google/genai'
import { asc, eq } from 'drizzle-orm'
import { env } from '../../../config/env'
import { db } from '../../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  setterMessage,
  setterDraft,
} from '../../../db/schema'
import { executeTool, type ToolContext } from './tools'
import { buildSystemInstruction, deriveBeat, validateOutput } from './prompts'
import { getProvider, type GenerateFn } from './providers'
import { syncLeadToCrm } from '../setter.crm-sync.service'
import { logSetterEvent } from '../setter.events.service'
import { notifyAdmins } from '../../notifications/notifications.service'

export type { GenerateFn, GenerateResult, AgentFunctionCall } from './providers'

/**
 * El cerebro del setter. Corre un turno del agente: arma el prompt, llama al LLM
 * (Gemini o Claude, según el Model Switcher del tenant) con function calling,
 * ejecuta las tools deterministas y genera un Draft en la cola de aprobación
 * (shadow: NO envía nada).
 *
 * `generate` es inyectable para testear el loop sin pegarle a ningún LLM real.
 */

const MAX_HOPS = 3

/**
 * maxOutputTokens alto a propósito: Gemini 3 es un modelo de razonamiento y el
 * "thinking" consume tokens de salida. Con un cap bajo (~400) el modelo gasta el
 * presupuesto pensando y el mensaje sale vacío. El largo del mensaje lo controla
 * el prompt (1-3 líneas), no este cap.
 */
const MAX_OUTPUT_TOKENS = 2048

export interface AgentTurnResult {
  draftId: string | null
  beat: string | null
  status: string
  skipped?: 'opted_out'
}

/** Mapea el historial persistido a `Content[]` de Gemini (solo user/assistant). */
function toContents(messages: { role: string; content: string }[]): Content[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
}

export async function runAgentTurn(
  leadId: string,
  opts?: { generate?: GenerateFn },
): Promise<AgentTurnResult> {
  const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
  if (!lead) throw new Error(`Lead no encontrado: ${leadId}`)

  const [person] = await db
    .select()
    .from(setterPerson)
    .where(eq(setterPerson.id, lead.personId))
    .limit(1)
  // Guardrail: si optó por salir, no se genera nada.
  if (person?.optedOut) return { draftId: null, beat: null, status: lead.status, skipped: 'opted_out' }

  const [tenant] = await db
    .select()
    .from(setterTenant)
    .where(eq(setterTenant.id, lead.tenantId))
    .limit(1)
  if (!tenant) throw new Error(`Tenant no encontrado: ${lead.tenantId}`)

  // Model Switcher: el provider lo decide la config del tenant (override en tests).
  const generate: GenerateFn = opts?.generate ?? getProvider(tenant.modelProvider)

  const [conversation] = await db
    .select()
    .from(setterConversation)
    .where(eq(setterConversation.personId, lead.personId))
    .limit(1)
  if (!conversation) throw new Error(`Conversación no encontrada para person ${lead.personId}`)

  const messages = await db
    .select({ role: setterMessage.role, content: setterMessage.content })
    .from(setterMessage)
    .where(eq(setterMessage.conversationId, conversation.id))
    .orderBy(asc(setterMessage.createdAt))
    .limit(40)

  const statusBefore = lead.status

  // Respondió al menos una vez → ENGAGED (la state machine arranca acá).
  if (statusBefore === 'NEW' || statusBefore === 'CONTACTED') {
    await db.update(setterLead).set({ status: 'ENGAGED' }).where(eq(setterLead.id, leadId))
  }
  const statusForGuide =
    statusBefore === 'NEW' || statusBefore === 'CONTACTED' ? 'ENGAGED' : statusBefore

  const systemInstruction = buildSystemInstruction(tenant, statusForGuide)
  const contents = toContents(messages)
  const ctx: ToolContext = { tenant, leadId }

  const toolsCalled: string[] = []
  let checkAvailabilityCalled = false
  let finalText = ''

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await generate({
      systemInstruction,
      contents,
      temperature: 0.4,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })

    if (res.functionCalls.length > 0) {
      // Turno del modelo (las tool calls) + respuestas de las tools. Usamos el
      // content crudo si vino (preserva el thoughtSignature que exige Gemini 3);
      // si no (tests con generate inyectado), lo reconstruimos.
      contents.push(
        res.modelContent ?? {
          role: 'model',
          parts: res.functionCalls.map((fc) => ({
            functionCall: { id: fc.id, name: fc.name, args: fc.args },
          })),
        },
      )
      const responseParts = []
      for (const fc of res.functionCalls) {
        toolsCalled.push(fc.name)
        if (fc.name === 'check_availability') checkAvailabilityCalled = true
        const result = await executeTool(fc.name, fc.args, ctx)
        responseParts.push({ functionResponse: { id: fc.id, name: fc.name, response: result } })
      }
      contents.push({ role: 'user', parts: responseParts })
      if (res.text) finalText = res.text
      continue
    }

    finalText = res.text
    break
  }

  finalText = finalText.trim()

  // Validación de salida (capa dura). Si falla o no hay texto → failsafe handoff.
  let beat = deriveBeat(statusBefore, toolsCalled)
  const validation = validateOutput(finalText, checkAvailabilityCalled)
  const recordedTools = [...toolsCalled]

  if (!validation.ok || !finalText) {
    await executeTool(
      'handoff_to_human',
      { reason: `Validación de salida: ${validation.reason ?? 'respuesta vacía'}` },
      ctx,
    )
    recordedTools.push('handoff_to_human')
    beat = 'handoff'
    finalText =
      finalText && validation.ok
        ? finalText
        : 'Dejame que el dueño te responda esto directamente, te escribe en un rato por acá 👍'
  }

  const [after] = await db
    .select({ status: setterLead.status })
    .from(setterLead)
    .where(eq(setterLead.id, leadId))
    .limit(1)

  // Shadow mode: el draft queda pending; NO se envía ni se persiste como Message.
  const [draft] = await db
    .insert(setterDraft)
    .values({
      tenantId: tenant.id,
      conversationId: conversation.id,
      leadId,
      content: finalText,
      beat,
      format: 'text',
      status: 'pending',
      toolCalls: { tools: recordedTools, checkAvailabilityCalled },
    })
    .returning({ id: setterDraft.id })

  // Notificación post-commit: aviso a todos los admins que hay un borrador esperando
  // aprobación. Solo se notifica si el tenant tiene portalId configurado y si el
  // beat no es 'handoff' (en handoff no hay draft que aprobar, es manejo humano).
  if (tenant.portalId && beat !== 'handoff' && draft?.id) {
    void notifyAdmins(tenant.portalId, {
      entityType: 'setter_draft',
      entityId: draft.id,
      type: 'setter_draft_pending',
      title: 'El setter tiene un borrador esperando tu aprobación',
      body: person?.name ? `Para «${person.name}»` : null,
      actionUrl: '/admin/setter',
    })
  }

  // Consola.
  void logSetterEvent({
    tenantId: tenant.id,
    level: beat === 'handoff' ? 'warn' : 'success',
    type: beat === 'handoff' ? 'agent' : 'draft',
    message:
      beat === 'handoff'
        ? `Failsafe → handoff a humano (lead ${after!.status})`
        : `Draft generado · ${beat} · lead ${after!.status}`,
    leadId,
    meta: { beat, status: after!.status, tools: recordedTools },
  })

  // Sync con el CRM (automático por etapa) — best-effort, no rompe el turno.
  // En test no corre (se testea syncLeadToCrm directo) para no ensuciar la DB de test.
  if (env.NODE_ENV !== 'test') {
    try {
      await syncLeadToCrm(leadId)
    } catch (err) {
      console.error(`[setter] sync CRM falló para lead ${leadId}:`, err)
    }
  }

  return { draftId: draft!.id, beat, status: after!.status }
}
