import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { recordHistory, auditLog, contact, deal, clientAccount } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, type PipelineContext } from '../../test/helpers'

const app = buildApp()
let token: string
let pipe: PipelineContext
let portalId: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  pipe = await ensurePipeline(ctx.portalId)
  token = await loginToken(app, ctx.email, ctx.password)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('deals + stage change', () => {
  let dealId: string

  it('crea un deal en la etapa inicial (201)', async () => {
    const res = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'Sitio web ACME', amount: 5000, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeTruthy()
    expect(res.body.data.stageId).toBe(pipe.firstStageId)
    dealId = res.body.data.id
  })

  it('rechaza crear deal con stage de otro pipeline (400)', async () => {
    const res = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'X', pipelineId: pipe.pipelineId, stageId: 'nonexistent-stage-id-xyz' })
    expect(res.status).toBe(400)
  })

  it('cambia de etapa y registra STAGE_CHANGE en record_history + audit_log', async () => {
    const res = await request(app.server)
      .patch(`/api/deals/${dealId}/stage`)
      .set(auth())
      .send({ stageId: pipe.wonStageId })
    expect(res.status).toBe(200)
    expect(res.body.data.stageId).toBe(pipe.wonStageId)

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'deal'), eq(recordHistory.entityId, dealId), eq(recordHistory.fieldName, 'stageId')))
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history.at(-1)!.newValue).toBe(String(pipe.wonStageId))

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'deal'), eq(auditLog.entityId, dealId), eq(auditLog.action, 'STAGE_CHANGE')))
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it('rechaza cambiar a un stage inexistente (400)', async () => {
    const res = await request(app.server).patch(`/api/deals/${dealId}/stage`).set(auth()).send({ stageId: 'nonexistent-stage-id-xyz' })
    expect(res.status).toBe(400)
  })
})

describe('POST /:id/activate-portal — invitación manual al Client Portal', () => {
  /** Crea un deal fresco en la etapa inicial, con o sin contacto principal / email. */
  async function seedDeal(tag: string, opts: { withContact: boolean; withEmail: boolean }): Promise<string> {
    let primaryContactId: string | undefined
    if (opts.withContact) {
      const [c] = await db
        .insert(contact)
        .values({
          portalId,
          firstName: 'Cliente',
          lastName: tag,
          email: opts.withEmail ? `activate-portal-${tag}-${Date.now()}@test.com` : undefined,
        })
        .returning()
      primaryContactId = c!.id
    }
    const res = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: `Deal activate-portal ${tag}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId })
    expect(res.status).toBe(201)
    return res.body.data.id as string
  }

  it('activa el portal, manda el email de bienvenida y persiste inviteSentAt (status: activated)', async () => {
    const id = await seedDeal('ok', { withContact: true, withEmail: true })

    const res = await request(app.server).post(`/api/deals/${id}/activate-portal`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('activated')
    expect(res.body.data.clientEmail).toBeTruthy()

    const [acc] = await db
      .select()
      .from(clientAccount)
      .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, res.body.data.clientEmail)))
      .limit(1)
    expect(acc).toBeDefined()
    // El email se manda DESPUÉS del commit; recién ahí se sella inviteSentAt (mismo patrón que changeStage).
    expect(acc!.inviteSentAt).not.toBeNull()

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'deal'), eq(auditLog.entityId, id), eq(auditLog.action, 'CLIENT_PORTAL_ACTIVATED')))
    expect(audit.length).toBe(1)
  })

  it('una segunda llamada al mismo deal es idempotente (status: already_active, sin duplicar cuenta ni reenviar email)', async () => {
    const id = await seedDeal('idem', { withContact: true, withEmail: true })

    const first = await request(app.server).post(`/api/deals/${id}/activate-portal`).set(auth())
    expect(first.body.data.status).toBe('activated')
    const email = first.body.data.clientEmail as string

    const second = await request(app.server).post(`/api/deals/${id}/activate-portal`).set(auth())
    expect(second.status).toBe(200)
    expect(second.body.data.status).toBe('already_active')
    expect(second.body.data.clientEmail).toBe(email)

    const accounts = await db.select().from(clientAccount).where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, email)))
    expect(accounts).toHaveLength(1)

    // La segunda llamada no vuelve a auditar (solo se audita cuando activa algo nuevo).
    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'deal'), eq(auditLog.entityId, id), eq(auditLog.action, 'CLIENT_PORTAL_ACTIVATED')))
    expect(audit.length).toBe(1)
  })

  it('deal sin contacto principal → status: missing_contact', async () => {
    const id = await seedDeal('no-contact', { withContact: false, withEmail: false })

    const res = await request(app.server).post(`/api/deals/${id}/activate-portal`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ status: 'missing_contact', clientEmail: null })
  })

  it('contacto principal sin email → status: missing_email', async () => {
    const id = await seedDeal('no-email', { withContact: true, withEmail: false })

    const res = await request(app.server).post(`/api/deals/${id}/activate-portal`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ status: 'missing_email', clientEmail: null })
  })

  it('un token de cliente (authenticateClient) no puede llamar esta ruta de admin (401)', async () => {
    const id = await seedDeal('client-token', { withContact: true, withEmail: true })

    // Cuenta de cliente real, con su propio clerkUserId — no un hub_user.
    const clientEmail = `client-only-${Date.now()}@test.com`
    const [c] = await db
      .insert(contact)
      .values({ portalId, firstName: 'Solo', lastName: 'Cliente', email: clientEmail })
      .returning()
    const clerkUserId = `clerk_test_client_only_${Date.now()}`
    await db.insert(clientAccount).values({ portalId, contactId: c!.id, email: clientEmail, clerkUserId })

    const res = await request(app.server)
      .post(`/api/deals/${id}/activate-portal`)
      .set({ Authorization: `Bearer faketoken:${clerkUserId}` })
    expect(res.status).toBe(401)
  })
})
