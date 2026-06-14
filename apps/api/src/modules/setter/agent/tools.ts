import { Type, type FunctionDeclaration } from '@google/genai'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { setterLead, setterAppointment, type setterTenant } from '../../../db/schema'
import { createId } from '../../../lib/id'

type Tenant = typeof setterTenant.$inferSelect

/** Contexto que reciben las tools para ejecutar acciones deterministas. */
export interface ToolContext {
  tenant: Tenant
  leadId: string
}

export type ToolResult = Record<string, unknown>

// ── Declaraciones (para Gemini function calling) ─────────────────────────────

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'check_availability',
    description:
      'Devuelve horarios libres reales para la call, en el timezone del lead. Usar SIEMPRE antes de proponer cualquier horario. Única fuente de slots.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        preferredRange: {
          type: Type.STRING,
          enum: ['morning', 'afternoon', 'this_week', 'next_week'],
          description: 'Preferencia de franja si el lead la mencionó.',
        },
      },
    },
  },
  {
    name: 'book_appointment',
    description:
      'Agenda la call. Única tool que agenda. Llamar solo tras reconfirmar el horario exacto con el lead.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startsAt: { type: Type.STRING, description: 'Inicio en ISO 8601 (uno de los slots de check_availability).' },
        durationMin: { type: Type.INTEGER, description: 'Duración en minutos (default 30).' },
        email: { type: Type.STRING, description: 'Email del lead para la invitación, si lo dio.' },
      },
      required: ['startsAt'],
    },
  },
  {
    name: 'save_qualification',
    description:
      'Guarda datos de calificación capturados en la charla. Llamar cada vez que descubrís dolor, fit, autoridad o timing.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pain: { type: Type.STRING },
        fit: { type: Type.STRING },
        authority: { type: Type.STRING },
        timing: { type: Type.STRING },
        score: { type: Type.INTEGER, description: 'Score de calificación 0-15 si lo podés estimar.' },
        notes: { type: Type.STRING },
      },
    },
  },
  {
    name: 'handoff_to_human',
    description:
      'Pasa la conversación a un humano (pedido explícito, deal grande, fuera de scope, frustración).',
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING } },
      required: ['reason'],
    },
  },
  {
    name: 'mark_not_interested',
    description: 'Marca al lead como no interesado / no fit, con cierre cordial.',
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING } },
      required: ['reason'],
    },
  },
]

// ── Implementaciones ─────────────────────────────────────────────────────────

function formatSlot(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
    hour12: false,
  }).format(d)
}

/**
 * MOCK de calendario (Sprint 0 — sin creds de Google Calendar). Devuelve 2 slots
 * próximos. Cuando se conecte el calendario real, se reemplaza esta función por
 * un freebusy + formateo en el tz del tenant. La interfaz para el LLM no cambia.
 */
async function checkAvailability(_args: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  const tz = ctx.tenant.timezone
  const slot1 = new Date()
  slot1.setDate(slot1.getDate() + 1)
  slot1.setHours(10, 0, 0, 0)
  const slot2 = new Date()
  slot2.setDate(slot2.getDate() + 2)
  slot2.setHours(15, 0, 0, 0)

  return {
    mock: true,
    slots: [
      { label: formatSlot(slot1, tz), startsAt: slot1.toISOString() },
      { label: formatSlot(slot2, tz), startsAt: slot2.toISOString() },
    ],
  }
}

/** Agenda la call. MOCK de calendario: calendarRef simulado (no toca GCal real). */
async function bookAppointment(args: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  const startsAtRaw = args['startsAt']
  const startsAt = typeof startsAtRaw === 'string' ? new Date(startsAtRaw) : new Date(NaN)
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: 'startsAt inválido (se esperaba ISO 8601)' }
  }
  const durationMin = typeof args['durationMin'] === 'number' ? args['durationMin'] : 30
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000)
  const calendarRef = `mock-${createId()}`

  await db
    .insert(setterAppointment)
    .values({
      tenantId: ctx.tenant.id,
      leadId: ctx.leadId,
      startsAt,
      endsAt,
      calendarRef,
      status: 'confirmed',
    })
    .onConflictDoUpdate({
      target: setterAppointment.leadId,
      set: { startsAt, endsAt, calendarRef, status: 'confirmed' },
    })

  await db.update(setterLead).set({ status: 'BOOKED' }).where(eq(setterLead.id, ctx.leadId))

  return { ok: true, calendarRef, startsAt: startsAt.toISOString(), mock: true }
}

async function saveQualification(args: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  const fields: Record<string, unknown> = {}
  for (const key of ['pain', 'fit', 'authority', 'timing', 'score', 'notes']) {
    if (args[key] !== undefined && args[key] !== null) fields[key] = args[key]
  }

  const [lead] = await db
    .select({ qualification: setterLead.qualification, status: setterLead.status })
    .from(setterLead)
    .where(eq(setterLead.id, ctx.leadId))
    .limit(1)

  // Merge (no reemplazo) sobre el jsonb de calificación.
  const merged = { ...(lead?.qualification ?? {}), ...fields }
  const score = typeof fields['score'] === 'number' ? (fields['score'] as number) : undefined

  // State machine: hacia QUALIFYING; QUALIFIED si el score lo amerita (>=10 de 15).
  const terminal = ['BOOKED', 'NOT_INTERESTED', 'HANDED_OFF', 'OPTED_OUT', 'BOOKING']
  let nextStatus = lead?.status
  if (lead && !terminal.includes(lead.status)) {
    nextStatus = score !== undefined && score >= 10 ? 'QUALIFIED' : 'QUALIFYING'
  }

  await db
    .update(setterLead)
    .set({ qualification: merged, status: nextStatus })
    .where(eq(setterLead.id, ctx.leadId))

  return { ok: true, status: nextStatus }
}

async function handoffToHuman(args: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  await db.update(setterLead).set({ status: 'HANDED_OFF' }).where(eq(setterLead.id, ctx.leadId))
  return { ok: true, reason: args['reason'] ?? null }
}

async function markNotInterested(args: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  await db.update(setterLead).set({ status: 'NOT_INTERESTED' }).where(eq(setterLead.id, ctx.leadId))
  return { ok: true, reason: args['reason'] ?? null }
}

const TOOLS: Record<string, (args: ToolResult, ctx: ToolContext) => Promise<ToolResult>> = {
  check_availability: checkAvailability,
  book_appointment: bookAppointment,
  save_qualification: saveQualification,
  handoff_to_human: handoffToHuman,
  mark_not_interested: markNotInterested,
}

/** Ejecuta una tool por nombre. Lanza si el nombre no existe. */
export async function executeTool(
  name: string,
  args: ToolResult,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name]
  if (!tool) throw new Error(`Tool desconocida: ${name}`)
  return tool(args, ctx)
}
