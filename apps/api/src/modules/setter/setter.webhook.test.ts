/**
 * setter.webhook.test.ts — Fase 2 (channel adapter)
 *
 * Tests de integración del webhook POST /webhooks/whatsapp (Evolution):
 *  - mensaje entrante → 200 + persiste message/person/lead/conversation + ventana
 *  - idempotencia por message_id (webhook reentregado no duplica)
 *  - opt-out por keyword → marca la Person y el Lead, no procesa más
 *  - ignora mensajes propios (fromMe) y de grupos
 *
 * El webhook procesa de forma asíncrona (responde 200 y delega), así que las
 * aserciones de DB esperan con un poll corto.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  setterMessage,
} from '../../db/schema'
import { ensurePortalAndUser } from '../../test/helpers'
import { closeSetterQueues } from './queue/setter.queue'

const app = buildApp()
let tenantId: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  const [t] = await db
    .insert(setterTenant)
    .values({
      portalId: ctx.portalId,
      name: `WH Test ${Date.now()}`,
      businessBrief: 'Brief de prueba',
      agentName: 'Tom',
      ownerName: 'Owner',
    })
    .returning()
  tenantId = t!.id
})

afterAll(async () => {
  await db.delete(setterTenant).where(eq(setterTenant.id, tenantId)) // cascade
  await closeSetterQueues()
  await app.close()
  await closeDb()
})

interface PayloadOpts {
  id: string
  jid?: string
  text?: string
  fromMe?: boolean
  pushName?: string
}

function evoPayload(opts: PayloadOpts): Record<string, unknown> {
  return {
    event: 'messages.upsert',
    instance: 'test',
    data: {
      key: {
        remoteJid: opts.jid ?? '5491155550000@s.whatsapp.net',
        fromMe: opts.fromMe ?? false,
        id: opts.id,
      },
      pushName: opts.pushName ?? 'Juan',
      message: { conversation: opts.text ?? 'hola, me interesa lo que hacen' },
    },
  }
}

async function waitForMessage(messageId: string, tries = 30): Promise<typeof setterMessage.$inferSelect | null> {
  for (let i = 0; i < tries; i++) {
    const [m] = await db
      .select()
      .from(setterMessage)
      .where(eq(setterMessage.messageId, messageId))
      .limit(1)
    if (m) return m
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

describe('POST /webhooks/whatsapp', () => {
  it('mensaje entrante → 200 y persiste message/person/lead/conversation + ventana', async () => {
    const id = `wamid.${Date.now()}-ok`
    const phone = '+5491155550001'
    const res = await request(app.server)
      .post('/webhooks/whatsapp')
      .send(evoPayload({ id, jid: '5491155550001@s.whatsapp.net' }))

    expect(res.status).toBe(200)

    const msg = await waitForMessage(id)
    expect(msg).toBeTruthy()
    expect(msg!.role).toBe('user')

    const [person] = await db
      .select()
      .from(setterPerson)
      .where(and(eq(setterPerson.tenantId, tenantId), eq(setterPerson.phone, phone)))
      .limit(1)
    expect(person).toBeTruthy()

    const [lead] = await db
      .select()
      .from(setterLead)
      .where(eq(setterLead.personId, person!.id))
      .limit(1)
    expect(lead).toBeTruthy()
    expect(lead!.windowExpiresAt).not.toBeNull()

    const [conv] = await db
      .select()
      .from(setterConversation)
      .where(eq(setterConversation.personId, person!.id))
      .limit(1)
    expect(conv).toBeTruthy()
  })

  it('idempotencia: mismo message_id no duplica', async () => {
    const id = `wamid.${Date.now()}-dup`
    const jid = '5491155550002@s.whatsapp.net'
    await request(app.server).post('/webhooks/whatsapp').send(evoPayload({ id, jid }))
    await waitForMessage(id)

    await request(app.server)
      .post('/webhooks/whatsapp')
      .send(evoPayload({ id, jid, text: 'otra vez' }))
    await new Promise((r) => setTimeout(r, 200))

    const rows = await db.select().from(setterMessage).where(eq(setterMessage.messageId, id))
    expect(rows.length).toBe(1)
  })

  it('opt-out por keyword → marca Person.opted_out y Lead OPTED_OUT', async () => {
    const id = `wamid.${Date.now()}-opt`
    const phone = '+5491155550003'
    await request(app.server)
      .post('/webhooks/whatsapp')
      .send(
        evoPayload({
          id,
          jid: '5491155550003@s.whatsapp.net',
          text: 'bajame de la lista, no me escribas mas',
        }),
      )
    await waitForMessage(id)

    const [person] = await db
      .select()
      .from(setterPerson)
      .where(and(eq(setterPerson.tenantId, tenantId), eq(setterPerson.phone, phone)))
      .limit(1)
    expect(person!.optedOut).toBe(true)
    expect(person!.optedOutAt).not.toBeNull()

    const [lead] = await db
      .select()
      .from(setterLead)
      .where(eq(setterLead.personId, person!.id))
      .limit(1)
    expect(lead!.status).toBe('OPTED_OUT')
  })

  it('ignora mensajes propios (fromMe) — no persiste nada', async () => {
    const id = `wamid.${Date.now()}-self`
    const res = await request(app.server)
      .post('/webhooks/whatsapp')
      .send(evoPayload({ id, fromMe: true }))
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 150))
    const [m] = await db
      .select()
      .from(setterMessage)
      .where(eq(setterMessage.messageId, id))
      .limit(1)
    expect(m).toBeUndefined()
  })
})
