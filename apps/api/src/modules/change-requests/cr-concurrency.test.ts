/**
 * Concurrencia e idempotencia de Change Requests: doble submit del cliente
 * (secuencial y en paralelo), envío concurrente de propuestas, transiciones
 * inválidas y una doble aprobación simultánea.
 *
 * Ver también `cr-flow.test.ts` y `cr-security.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { changeRequest, changeRequestProposal } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureClientAccount, loginToken, listenForSupertest } from '../../test/helpers'

const app = buildApp()

let portalId: string
let adminToken: string
let dealId: string

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  const pipe = await ensurePipeline(portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ name: 'Deal concurrencia CR', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
  dealId = dealRes.body.data.id as string
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

// ── Idempotencia / doble submit ─────────────────────────────────────────────

describe('change-requests — idempotencia del alta del cliente (clientRequestId)', () => {
  it('dos POST secuenciales con el mismo clientRequestId devuelven la misma CR (201 y luego 200) y hay UNA sola fila', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const clientRequestId = `secuencial-${Date.now()}`
    const body = { title: 'Alta idempotente secuencial', description: 'Debe crear una sola fila', clientRequestId }

    const first = await request(app.server).post('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` }).send(body)
    expect(first.status).toBe(201)

    const second = await request(app.server).post('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` }).send(body)
    expect(second.status).toBe(200)
    expect(second.body.data.id).toBe(first.body.data.id)

    const rows = await db.select().from(changeRequest).where(and(eq(changeRequest.dealId, dealId), eq(changeRequest.clientRequestId, clientRequestId)))
    expect(rows).toHaveLength(1)
  })

  it('dos POST en paralelo con el mismo clientRequestId: una gana con 201 y la otra devuelve la misma CR con 200, y queda UNA sola fila', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const clientRequestId = `paralelo-${Date.now()}`
    const body = { title: 'Alta idempotente paralela', description: 'El índice único parcial tiene que aguantar la carrera', clientRequestId }

    const [r1, r2] = await Promise.all([
      request(app.server).post('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` }).send(body),
      request(app.server).post('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` }).send(body),
    ])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 201])
    expect(r1.body.data.id).toBe(r2.body.data.id)

    const rows = await db.select().from(changeRequest).where(and(eq(changeRequest.dealId, dealId), eq(changeRequest.clientRequestId, clientRequestId)))
    expect(rows).toHaveLength(1)
  })
})

// ── Concurrencia de propuestas ───────────────────────────────────────────────

describe('change-requests — N propuestas concurrentes sobre la misma CR', () => {
  it('salen versiones 1..N sin huecos ni duplicados', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR para propuestas concurrentes', description: 'N creates en paralelo' })
    const crId = created.body.data.id as string

    const N = 8
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(app.server)
          .post(`/api/change-requests/${crId}/proposals`)
          .set(adminAuth())
          .send({ amount: 100 + i, send: false }),
      ),
    )
    expect(results.every((r) => r.status === 201)).toBe(true)

    const rows = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.changeRequestId, crId))
    const versions = rows.map((r) => r.version).sort((a, b) => a - b)
    expect(versions).toEqual(Array.from({ length: N }, (_, i) => i + 1))
    expect(new Set(versions).size).toBe(N)
  })
})

// ── Transiciones inválidas ───────────────────────────────────────────────────

describe('change-requests — transiciones que ADMIN_TRANSITIONS / CLIENT_TRANSITIONS no permiten', () => {
  it('el admin no puede saltar de draft a negotiating (409)', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR salto inválido', description: 'draft -> negotiating no es legal' })
    const crId = created.body.data.id as string

    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'negotiating' })
    expect(res.status).toBe(409)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('draft')
  })

  it('un estado terminal (rejected) no admite ninguna transición saliente', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR terminal', description: 'Va a quedar rejected' })
    const crId = created.body.data.id as string
    // draft no puede ir directo a rejected (ADMIN_TRANSITIONS.draft = ['sent','cancelled']):
    // primero sent —enviando una propuesta, la única puerta a ese estado— y de
    // ahí sí a rejected.
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 150, send: true })
    const rejected = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'rejected' })
    expect(rejected.status).toBe(200)
    expect(rejected.body.data.status).toBe('rejected')

    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'cancelled' })
    expect(res.status).toBe(409)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('rejected')
  })

  /**
   * REGRESIÓN — `POST /transition {status:'sent'}` dejaba la CR esperando una
   * decisión SIN propuesta: el portal mostraba "Requiere tu decisión" y los tres
   * botones sobre la nada, y si el cliente aprobaba la CR terminaba `approved`
   * con `approvedProposalId` en null y el evento con la metadata vacía.
   */
  it('el admin no puede llegar a sent por la ruta genérica de transición (400) y la CR no se mueve', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR sent por transición', description: 'Enviar es crear una propuesta, no mover un estado' })
    const crId = created.body.data.id as string

    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'sent' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('/proposals')

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('draft')
    expect(cr?.currentProposalId).toBeNull()
  })

  it('el cliente no puede aprobar una CR que no está en sent (409)', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR todavía submitted', description: 'No hay propuesta enviada aún' })
    const crId = create.body.data.id as string
    expect(create.body.data.status).toBe('submitted')

    const res = await request(app.server).post(`/api/client/change-requests/${crId}/approve`).set({ Authorization: `Bearer ${client.token}` }).send({})
    expect(res.status).toBe(409)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('submitted')
  })
})

// ── Doble aprobación concurrente ─────────────────────────────────────────────

describe('change-requests — dos aprobaciones concurrentes sobre la misma CR', () => {
  it('solo una gana (200); la otra recibe 409 y no pisa la decisión de la primera', async () => {
    const clientA = await ensureClientAccount(portalId, dealId)
    const clientB = await ensureClientAccount(portalId, dealId)

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${clientA.token}` })
      .send({ title: 'CR para doble aprobación', description: 'Dos clientes con acceso al mismo deal' })
    const crId = create.body.data.id as string
    await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 300, send: true })

    const [r1, r2] = await Promise.all([
      request(app.server).post(`/api/client/change-requests/${crId}/approve`).set({ Authorization: `Bearer ${clientA.token}` }).send({}),
      request(app.server).post(`/api/client/change-requests/${crId}/approve`).set({ Authorization: `Bearer ${clientB.token}` }).send({}),
    ])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('approved')
    // El aprobador que quedó registrado es UNO solo de los dos clientes, nunca ninguno ni los dos.
    expect([clientA.clientId, clientB.clientId]).toContain(cr?.approvedBy)
  })
})
