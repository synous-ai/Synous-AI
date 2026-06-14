/**
 * setter.approval.test.ts — Fase 4 (cola de aprobación, backend)
 *
 * Tests de integración de /api/setter/drafts (detrás de auth hub_user):
 *  - sin token → 401
 *  - list devuelve los drafts pending con contexto
 *  - approve → persiste mensaje saliente + finaliza el draft (approved, Evolution off)
 *  - reject → rechaza sin enviar
 *  - edit → guarda editedContent y finaliza
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
  setterDraft,
  setterMessage,
} from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

const app = buildApp()
let tenantId: string
let token: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  token = await loginToken(app, ctx.email, ctx.password)
  const [t] = await db
    .insert(setterTenant)
    .values({
      portalId: ctx.portalId,
      name: `Approval Test ${Date.now()}`,
      businessBrief: 'Brief',
      agentName: 'Tom',
      ownerName: 'Owner',
    })
    .returning()
  tenantId = t!.id
})

afterAll(async () => {
  await db.delete(setterTenant).where(eq(setterTenant.id, tenantId)) // cascade
  await app.close()
  await closeDb()
})

async function makePendingDraft(content = 'Hola! Qué te urge resolver hoy?'): Promise<string> {
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
    .values({ tenantId, personId: person!.id, status: 'QUALIFYING' })
    .returning()
  const [draft] = await db
    .insert(setterDraft)
    .values({
      tenantId,
      conversationId: conv!.id,
      leadId: lead!.id,
      content,
      beat: 'calificacion',
      status: 'pending',
    })
    .returning()
  return draft!.id
}

describe('/api/setter/drafts', () => {
  it('sin token → 401', async () => {
    const res = await request(app.server).get('/api/setter/drafts')
    expect(res.status).toBe(401)
  })

  it('list devuelve los drafts pending con contexto del lead', async () => {
    const draftId = await makePendingDraft()
    const res = await request(app.server)
      .get('/api/setter/drafts')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const found = (res.body.data as Array<{ id: string; leadStatus: string; personPhone: string }>).find(
      (d) => d.id === draftId,
    )
    expect(found).toBeDefined()
    expect(found!.leadStatus).toBe('QUALIFYING')
    expect(found!.personPhone).toMatch(/^\+/)
  })

  it('approve → finaliza el draft y persiste el mensaje saliente', async () => {
    const draftId = await makePendingDraft()
    const res = await request(app.server)
      .post(`/api/setter/drafts/${draftId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(200)
    // Evolution no configurado en test → queda 'approved' (envío diferido).
    expect(res.body.data.status).toBe('approved')
    expect(res.body.data.sent).toBe(false)

    const [draft] = await db.select().from(setterDraft).where(eq(setterDraft.id, draftId)).limit(1)
    expect(draft!.status).toBe('approved')
    expect(draft!.sentMessageId).toBeTruthy()

    const outbound = await db
      .select()
      .from(setterMessage)
      .where(and(eq(setterMessage.conversationId, draft!.conversationId), eq(setterMessage.role, 'assistant')))
    expect(outbound.length).toBe(1)
  })

  it('approve de un draft ya finalizado → 409', async () => {
    const draftId = await makePendingDraft()
    await request(app.server)
      .post(`/api/setter/drafts/${draftId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    const res = await request(app.server)
      .post(`/api/setter/drafts/${draftId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(409)
  })

  it('reject → rechaza sin enviar', async () => {
    const draftId = await makePendingDraft()
    const res = await request(app.server)
      .post(`/api/setter/drafts/${draftId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('rejected')
    const [draft] = await db.select().from(setterDraft).where(eq(setterDraft.id, draftId)).limit(1)
    expect(draft!.status).toBe('rejected')
  })

  it('edit → guarda editedContent y finaliza', async () => {
    const draftId = await makePendingDraft()
    const edited = 'Editado: te queda mejor mañana o el jueves?'
    const res = await request(app.server)
      .post(`/api/setter/drafts/${draftId}/edit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: edited })

    expect(res.status).toBe(200)
    const [draft] = await db.select().from(setterDraft).where(eq(setterDraft.id, draftId)).limit(1)
    expect(draft!.editedContent).toBe(edited)
    expect(['approved', 'edited']).toContain(draft!.status)
  })
})

describe('/api/setter/config — Model Switcher', () => {
  it('GET /config devuelve modelProvider y providers disponibles', async () => {
    const res = await request(app.server)
      .get('/api/setter/config')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(['gemini', 'claude']).toContain(res.body.data.modelProvider)
    expect(res.body.data.providers).toHaveProperty('gemini')
    expect(res.body.data.providers).toHaveProperty('claude')
  })

  it('PATCH /config/model-provider cambia el LLM', async () => {
    const res = await request(app.server)
      .patch('/api/setter/config/model-provider')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelProvider: 'claude' })
    expect(res.status).toBe(200)
    expect(res.body.data.modelProvider).toBe('claude')
    // revertir para no afectar otros asserts
    await request(app.server)
      .patch('/api/setter/config/model-provider')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelProvider: 'gemini' })
  })

  it('PATCH con provider inválido → 400', async () => {
    const res = await request(app.server)
      .patch('/api/setter/config/model-provider')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelProvider: 'gpt' })
    expect(res.status).toBe(400)
  })
})
