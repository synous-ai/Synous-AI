import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { changeRequestHistory } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let dealId: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  token = await loginToken(app, ctx.email, ctx.password)

  // Necesitamos un deal real para asociar las CRs
  const pipe = await ensurePipeline(portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      name: 'Deal para CR tests',
      pipelineId: pipe.pipelineId,
      stageId: pipe.firstStageId,
    })
  dealId = dealRes.body.data.id as string
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

// Helper: crea una CR mínima y devuelve la respuesta
async function createTestCR(overrides: {
  title?: string
  description?: string
  dealId?: string
} = {}) {
  return request(app.server)
    .post('/api/change-requests')
    .set(auth())
    .send({
      dealId: overrides.dealId ?? dealId,
      title: overrides.title ?? 'Cambio de alcance',
      description: overrides.description ?? 'Descripción del cambio',
    })
}

// ── Numeración relativa al deal ───────────────────────────────────────────────

describe('change-requests — numeración relativa al deal', () => {
  it('la primera CR de un deal tiene number = 1', async () => {
    // Usar un deal nuevo para garantizar que parte de 0
    const pipe = await ensurePipeline(portalId)
    const dealRes = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({
        name: 'Deal numeración CR',
        pipelineId: pipe.pipelineId,
        stageId: pipe.firstStageId,
      })
    const newDealId = dealRes.body.data.id as string

    const res = await createTestCR({ dealId: newDealId, title: 'CR-1' })
    expect(res.status).toBe(201)
    expect(res.body.data.number).toBe(1)
  })

  it('CRs sucesivas en el mismo deal incrementan el number', async () => {
    const pipe = await ensurePipeline(portalId)
    const dealRes = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({
        name: 'Deal numeración secuencial',
        pipelineId: pipe.pipelineId,
        stageId: pipe.firstStageId,
      })
    const newDealId = dealRes.body.data.id as string

    const r1 = await createTestCR({ dealId: newDealId, title: 'CR primera' })
    const r2 = await createTestCR({ dealId: newDealId, title: 'CR segunda' })
    const r3 = await createTestCR({ dealId: newDealId, title: 'CR tercera' })

    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r3.status).toBe(201)
    expect(r1.body.data.number).toBe(1)
    expect(r2.body.data.number).toBe(2)
    expect(r3.body.data.number).toBe(3)
  })

  it('CRs de deals distintos tienen números independientes', async () => {
    const pipe = await ensurePipeline(portalId)
    const d1 = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'Deal A', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    const d2 = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'Deal B', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })

    const crA = await createTestCR({ dealId: d1.body.data.id, title: 'CR deal A' })
    const crB = await createTestCR({ dealId: d2.body.data.id, title: 'CR deal B' })

    expect(crA.body.data.number).toBe(1)
    expect(crB.body.data.number).toBe(1)
  })
})

// ── Estado inicial + historial ────────────────────────────────────────────────

describe('change-requests — estado inicial y historial', () => {
  it('una CR creada empieza en status draft', async () => {
    const res = await createTestCR()
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('draft')
  })

  it('crear una CR registra el primer historial (draft)', async () => {
    const res = await createTestCR()
    expect(res.status).toBe(201)
    const crId = res.body.data.id as string

    const history = await db
      .select()
      .from(changeRequestHistory)
      .where(eq(changeRequestHistory.changeRequestId, crId))

    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0]?.toStatus).toBe('draft')
    expect(history[0]?.fromStatus).toBeNull()
  })
})

// ── Transición de estado ──────────────────────────────────────────────────────

describe('change-requests — transitionCR', () => {
  it('transicionar de draft a sent cambia el status y registra historial', async () => {
    const res = await createTestCR()
    expect(res.status).toBe(201)
    const crId = res.body.data.id as string

    const transition = await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'sent' })
    expect(transition.status).toBe(200)
    expect(transition.body.data.status).toBe('sent')

    const history = await db
      .select()
      .from(changeRequestHistory)
      .where(eq(changeRequestHistory.changeRequestId, crId))

    // Debe haber al menos 2 entradas: draft (creación) + sent (transición)
    expect(history.length).toBeGreaterThanOrEqual(2)
    const lastEntry = history.sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )[0]
    expect(lastEntry?.fromStatus).toBe('draft')
    expect(lastEntry?.toStatus).toBe('sent')
  })

  it('transición con comentario persiste el comment en el historial', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'sent', comment: 'Enviada al cliente para revisión' })

    const history = await db
      .select()
      .from(changeRequestHistory)
      .where(eq(changeRequestHistory.changeRequestId, crId))

    const withComment = history.filter((h) => h.comment != null)
    expect(withComment.length).toBeGreaterThanOrEqual(1)
    expect(withComment.at(-1)?.comment).toBe('Enviada al cliente para revisión')
  })

  it('transicionar a completed registra completedAt en la CR', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    // Flujo: draft → sent → approved → completed
    for (const status of ['sent', 'approved', 'completed']) {
      await request(app.server)
        .post(`/api/change-requests/${crId}/transition`)
        .set(auth())
        .send({ status })
    }

    const detail = await request(app.server)
      .get(`/api/change-requests/${crId}`)
      .set(auth())
    expect(detail.status).toBe(200)
    expect(detail.body.data.changeRequest.completedAt).not.toBeNull()
  })
})

// ── Items ─────────────────────────────────────────────────────────────────────

describe('change-requests — items', () => {
  it('agregar un ítem a una CR en draft (201)', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    const item = await request(app.server)
      .post(`/api/change-requests/${crId}/items`)
      .set(auth())
      .send({ description: 'Diseño extra', unitPrice: 300, quantity: 1 })
    expect(item.status).toBe(201)
    expect(item.body.data.description).toBe('Diseño extra')
  })

  it('no se pueden agregar ítems a una CR no-draft', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    // Mover a "sent"
    await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'sent' })

    const item = await request(app.server)
      .post(`/api/change-requests/${crId}/items`)
      .set(auth())
      .send({ description: 'Item no permitido', unitPrice: 100 })
    expect(item.status).toBe(400)
  })
})

// ── Edición solo en draft ─────────────────────────────────────────────────────

describe('change-requests — updateCR solo en draft', () => {
  it('PATCH rechazado si la CR no está en draft', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'sent' })

    const update = await request(app.server)
      .patch(`/api/change-requests/${crId}`)
      .set(auth())
      .send({ title: 'Nuevo título prohibido' })
    expect(update.status).toBe(400)
  })
})

// ── Require auth ──────────────────────────────────────────────────────────────

describe('change-requests — autenticación requerida', () => {
  it('GET /change-requests sin token devuelve 401', async () => {
    const res = await request(app.server).get('/api/change-requests')
    expect(res.status).toBe(401)
  })
})
