/**
 * Vista de admin del portal: un integrante del equipo abre `<slug>.synousai.com`
 * con su sesión y ve el portal de esa empresa tal como lo ve su cliente, sin
 * poder escribir nada en su nombre.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { auditLog, clientAccount, clientDealAccess, clientOnboarding, company, contact, deal } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, listenForSupertest } from '../../test/helpers'

const app = buildApp()

let adminToken: string
let clientToken: string
let clientAccountId: string
let companyId: string
let dealId: string
let slug: string
let emptySlug: string

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  adminToken = await loginToken(app, ctx.email, ctx.password)
  const ventas = await ensurePipeline(ctx.portalId)

  const stamp = Date.now()
  slug = `vista-admin-${stamp}`
  emptySlug = `sin-portal-${stamp}`

  const [co] = await db.insert(company).values({ portalId: ctx.portalId, name: 'Vista Admin', slug }).returning()
  companyId = co!.id
  await db.insert(company).values({ portalId: ctx.portalId, name: 'Sin Portal', slug: emptySlug })

  const email = `vista-admin-${stamp}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId: ctx.portalId, firstName: 'Vista', lastName: 'Admin', email, companyId })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId: ctx.portalId,
      name: 'Deal Vista Admin',
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      companyId,
      ownerId: ctx.userId,
    })
    .returning()
  dealId = d!.id

  const clerkUserId = `clerk_test_portal_view_${stamp}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId: ctx.portalId, contactId: c!.id, email, clerkUserId, isActive: true })
    .returning()
  clientAccountId = ca!.id
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId })
  clientToken = `faketoken:${clerkUserId}`
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const asAdmin = (portal?: string) => ({
  Authorization: `Bearer ${adminToken}`,
  ...(portal ? { 'X-Portal-View': portal } : {}),
})

describe('vista de admin del portal (solo lectura)', () => {
  it('el admin abre el portal de la empresa como su cliente', async () => {
    const res = await request(app.server).get('/api/client-auth/me').set(asAdmin(slug))
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(clientAccountId)
    expect(res.body.data.viewer).toEqual({ companyId, companySlug: slug })
  })

  it('ve los mismos datos que el cliente', async () => {
    const [asClient, asViewer] = await Promise.all([
      request(app.server).get('/api/client/deals').set({ Authorization: `Bearer ${clientToken}` }),
      request(app.server).get('/api/client/deals').set(asAdmin(slug)),
    ])
    expect(asClient.status).toBe(200)
    expect(asViewer.status).toBe(200)
    expect(asViewer.body).toEqual(asClient.body)
  })

  it('registra la apertura del portal en la auditoría', async () => {
    await request(app.server).get('/api/client-auth/me').set(asAdmin(slug))
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'PORTAL_VIEW'), eq(auditLog.entityId, companyId)))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.entityType).toBe('company')
  })

  it('rechaza cualquier escritura con 403 (no 401, que cerraría su sesión)', async () => {
    const res = await request(app.server).post('/api/client/notifications/read-all').set(asAdmin(slug))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PORTAL_VIEW_READ_ONLY')
  })

  it('sin el slug del portal responde 403, no 401', async () => {
    const res = await request(app.server).get('/api/client/deals').set(asAdmin())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PORTAL_VIEW_SLUG_REQUIRED')
  })

  it('una empresa sin portal activado responde 404', async () => {
    const res = await request(app.server).get('/api/client-auth/me').set(asAdmin(emptySlug))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('PORTAL_NOT_ACTIVATED')
  })

  it('un slug que no es una empresa responde 404', async () => {
    const res = await request(app.server).get('/api/client-auth/me').set(asAdmin('no-existe-esta-empresa'))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('PORTAL_NOT_FOUND')
  })

  it('mirar el onboarding no lo crea', async () => {
    const res = await request(app.server).get('/api/client/onboarding').set(asAdmin(slug))
    expect(res.status).toBe(200)
    expect(res.body.data.onboarding.currentStep).toBe(1)
    const rows = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(rows).toHaveLength(0)
  })

  it('para un cliente el header no cambia nada', async () => {
    const res = await request(app.server)
      .get('/api/client-auth/me')
      .set({ Authorization: `Bearer ${clientToken}`, 'X-Portal-View': emptySlug })
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(clientAccountId)
    expect(res.body.data.viewer).toBeNull()
  })
})
