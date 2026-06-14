/**
 * setter.data.test.ts — Fase 1 (data layer)
 *
 * Valida el schema del setter contra la DB real de test:
 *  - se crea un setter_lead con su setter_person y setter_conversation, linkeados
 *  - message_id es idempotente (unique constraint)
 *  - el opt-out se marca en la Person (guardrail no negociable)
 *
 * Crea su propio tenant y lo borra al final (cascade limpia todo lo demás).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  setterMessage,
} from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser } from '../../test/helpers'

let tenantId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  const [t] = await db
    .insert(setterTenant)
    .values({
      portalId: ctx.portalId,
      name: `Test Setter ${createId()}`,
      businessBrief: 'Brief de prueba',
      agentName: 'Tom',
      ownerName: 'Owner',
    })
    .returning()
  tenantId = t!.id
})

afterAll(async () => {
  // cascade borra person/lead/conversation/message/draft/appointment del tenant
  await db.delete(setterTenant).where(eq(setterTenant.id, tenantId))
  await closeDb()
})

/** Crea una Person nueva con teléfono único para el tenant de test. */
async function newPerson(): Promise<{ id: string }> {
  const [person] = await db
    .insert(setterPerson)
    .values({ tenantId, name: 'Lead Test', phone: `+5490${createId().slice(0, 9)}` })
    .returning({ id: setterPerson.id })
  return person!
}

describe('setter data layer', () => {
  it('crea un setter_lead con su setter_person y setter_conversation linkeados', async () => {
    const person = await newPerson()

    const [lead] = await db
      .insert(setterLead)
      .values({ tenantId, personId: person.id, status: 'NEW', source: 'inbound_whatsapp' })
      .returning()

    const [conversation] = await db
      .insert(setterConversation)
      .values({ tenantId, personId: person.id })
      .returning()

    expect(lead!.personId).toBe(person.id)
    expect(lead!.status).toBe('NEW')
    expect(conversation!.personId).toBe(person.id)
    expect(conversation!.channel).toBe('whatsapp')
  })

  it('message_id es idempotente (unique constraint)', async () => {
    const person = await newPerson()
    const [conversation] = await db
      .insert(setterConversation)
      .values({ tenantId, personId: person.id })
      .returning()

    const messageId = `wamid.${createId()}`
    await db.insert(setterMessage).values({
      conversationId: conversation!.id,
      role: 'user',
      content: 'hola',
      messageId,
    })

    // El mismo message_id no se puede insertar dos veces (webhooks se reentregan).
    await expect(
      db.insert(setterMessage).values({
        conversationId: conversation!.id,
        role: 'user',
        content: 'duplicado',
        messageId,
      }),
    ).rejects.toThrow()
  })

  it('marca opt-out en la Person (guardrail no negociable)', async () => {
    const person = await newPerson()

    await db
      .update(setterPerson)
      .set({ optedOut: true, optedOutAt: new Date() })
      .where(eq(setterPerson.id, person.id))

    const [updated] = await db
      .select()
      .from(setterPerson)
      .where(eq(setterPerson.id, person.id))
      .limit(1)

    expect(updated!.optedOut).toBe(true)
    expect(updated!.optedOutAt).not.toBeNull()
  })
})
