/**
 * brain.test.ts — Fase 3 (el cerebro)
 *
 * Testea el loop del agente con `generate` INYECTADO (determinista, sin pegarle
 * a Vertex real):
 *  - respuesta de texto → genera Draft pending con beat, sin enviar, status ENGAGED
 *  - tool save_qualification → guarda calificación + status QUALIFYING
 *  - check_availability + book_appointment → crea appointment + status BOOKED
 *  - validación de salida (horario sin check_availability) → failsafe handoff
 *  - opt-out → no genera nada
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  setterMessage,
  setterDraft,
  setterAppointment,
} from '../../../db/schema'
import { createId } from '../../../lib/id'
import { ensurePortalAndUser } from '../../../test/helpers'
import { runAgentTurn, type GenerateFn, type GenerateResult } from './brain'

let tenantId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  const [t] = await db
    .insert(setterTenant)
    .values({
      portalId: ctx.portalId,
      name: `Brain Test ${Date.now()}`,
      businessBrief: 'Vendemos plataformas SaaS a medida. El setter no cotiza.',
      agentName: 'Tom',
      ownerName: 'Jere',
    })
    .returning()
  tenantId = t!.id
})

afterAll(async () => {
  await db.delete(setterTenant).where(eq(setterTenant.id, tenantId)) // cascade
  await closeDb()
})

/** generate inyectado que devuelve pasos guionados (último se repite). */
function scripted(steps: GenerateResult[]): GenerateFn {
  let i = 0
  return async () => steps[Math.min(i++, steps.length - 1)]!
}

async function setupLead(opts?: { status?: string; text?: string }): Promise<string> {
  const [person] = await db
    .insert(setterPerson)
    .values({ tenantId, phone: `+5491${createId().slice(0, 9)}`, name: 'Lead' })
    .returning()
  const [conv] = await db
    .insert(setterConversation)
    .values({ tenantId, personId: person!.id })
    .returning()
  const [lead] = await db
    .insert(setterLead)
    .values({ tenantId, personId: person!.id, status: opts?.status ?? 'NEW' })
    .returning()
  await db.insert(setterMessage).values({
    conversationId: conv!.id,
    role: 'user',
    content: opts?.text ?? 'hola, me interesa',
    messageId: `wamid.${createId()}`,
  })
  return lead!.id
}

describe('runAgentTurn', () => {
  it('respuesta de texto → Draft pending con beat, sin enviar, lead a ENGAGED', async () => {
    const leadId = await setupLead({ status: 'NEW' })
    const result = await runAgentTurn(leadId, {
      generate: scripted([{ functionCalls: [], text: 'Hola! Qué es lo que más te urge resolver hoy?' }]),
    })

    expect(result.draftId).toBeTruthy()
    expect(result.beat).toBe('apertura')

    const [draft] = await db
      .select()
      .from(setterDraft)
      .where(eq(setterDraft.id, result.draftId!))
      .limit(1)
    expect(draft!.status).toBe('pending')
    expect(draft!.content).toContain('urge')

    const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
    expect(lead!.status).toBe('ENGAGED')
  })

  it('save_qualification → guarda calificación y pasa a QUALIFYING', async () => {
    const leadId = await setupLead({ status: 'ENGAGED', text: 'tengo 200 alumnos y todo en planillas' })
    const result = await runAgentTurn(leadId, {
      generate: scripted([
        { functionCalls: [{ name: 'save_qualification', args: { pain: 'operación manual', fit: 'sí' } }], text: '' },
        { functionCalls: [], text: 'Buenísimo. Y eso lo manejás vos o tenés equipo?' },
      ]),
    })

    expect(result.beat).toBe('calificacion')
    const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
    expect(lead!.status).toBe('QUALIFYING')
    expect((lead!.qualification as Record<string, unknown>)?.['pain']).toBe('operación manual')
  })

  it('check_availability + book_appointment → crea appointment y pasa a BOOKED', async () => {
    const leadId = await setupLead({ status: 'QUALIFIED', text: 'dale, agendemos' })
    const startsAt = new Date(Date.now() + 86_400_000).toISOString()
    const result = await runAgentTurn(leadId, {
      generate: scripted([
        { functionCalls: [{ name: 'check_availability', args: {} }], text: '' },
        { functionCalls: [{ name: 'book_appointment', args: { startsAt } }], text: '' },
        { functionCalls: [], text: 'Listo, te agendo. Te llega la confirmación por acá.' },
      ]),
    })

    expect(result.beat).toBe('booking')
    expect(result.status).toBe('BOOKED')

    const [appt] = await db
      .select()
      .from(setterAppointment)
      .where(eq(setterAppointment.leadId, leadId))
      .limit(1)
    expect(appt).toBeTruthy()
    expect(appt!.calendarRef).toMatch(/^mock-/)
  })

  it('menciona horario sin check_availability → failsafe handoff', async () => {
    const leadId = await setupLead({ status: 'ENGAGED' })
    const result = await runAgentTurn(leadId, {
      generate: scripted([{ functionCalls: [], text: 'Te va mañana 10hs?' }]),
    })

    expect(result.beat).toBe('handoff')
    const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
    expect(lead!.status).toBe('HANDED_OFF')
  })

  it('lead con opt-out → no genera Draft', async () => {
    const leadId = await setupLead({ status: 'ENGAGED' })
    const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
    await db
      .update(setterPerson)
      .set({ optedOut: true, optedOutAt: new Date() })
      .where(eq(setterPerson.id, lead!.personId))

    const result = await runAgentTurn(leadId, {
      generate: scripted([{ functionCalls: [], text: 'no debería generarse' }]),
    })

    expect(result.skipped).toBe('opted_out')
    expect(result.draftId).toBeNull()
  })
})
