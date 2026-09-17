import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq, sql } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { changeRequestHistory } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, listenForSupertest } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let dealId: string

beforeAll(async () => {
  await listenForSupertest(app)
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

/**
 * Manda la CR a `sent` por la ÚNICA puerta que existe: enviarle una propuesta
 * al cliente. `POST /transition {status:'sent'}` ya no es válido — dejaba la CR
 * esperando una decisión sin ninguna propuesta que decidir.
 */
async function sendProposalFor(crId: string, amount = 500) {
  return request(app.server)
    .post(`/api/change-requests/${crId}/proposals`)
    .set(auth())
    .send({ amount, send: true })
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

// ── Numeración bajo concurrencia ─────────────────────────────────────────────

async function createTestDeal(name: string): Promise<string> {
  const pipe = await ensurePipeline(portalId)
  const res = await request(app.server)
    .post('/api/deals')
    .set(auth())
    .send({ name, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
  return res.body.data.id as string
}

describe('change-requests — numeración concurrente', () => {
  it('N creates simultáneos en el mismo deal salen todos 201 con números 1..N', async () => {
    const newDealId = await createTestDeal('Deal CR concurrente')
    const N = 8
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => createTestCR({ dealId: newDealId, title: `CR concurrente ${i}` })),
    )
    expect(results.map((r) => r.status)).toEqual(Array(N).fill(201))
    const numbers = results.map((r) => r.body.data.number as number).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1))
  })

  it('el lock de numeración es por deal: un deal bloqueado no frena a otro', async () => {
    const lockedDealId = await createTestDeal('Deal CR bloqueado')
    const freeDealId = await createTestDeal('Deal CR libre')

    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    let lockTaken!: () => void
    const locked = new Promise<void>((resolve) => { lockTaken = resolve })
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`change-request-number:${lockedDealId}`}))`)
      lockTaken()
      await released
    })
    await locked

    let blockedDone = false
    const blocked = createTestCR({ dealId: lockedDealId, title: 'CR esperando lock' }).then((r) => {
      blockedDone = true
      return r
    })

    const free = await createTestCR({ dealId: freeDealId, title: 'CR sin espera' })
    expect(free.status).toBe(201)
    expect(blockedDone).toBe(false)

    release()
    await holder
    const blockedRes = await blocked
    expect(blockedRes.status).toBe(201)
    expect(blockedRes.body.data.number).toBe(1)
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
  it('transicionar de draft a cancelled cambia el status y registra historial', async () => {
    const res = await createTestCR()
    expect(res.status).toBe(201)
    const crId = res.body.data.id as string

    const transition = await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'cancelled' })
    expect(transition.status).toBe(200)
    expect(transition.body.data.status).toBe('cancelled')

    const history = await db
      .select()
      .from(changeRequestHistory)
      .where(eq(changeRequestHistory.changeRequestId, crId))

    // Debe haber al menos 2 entradas: draft (creación) + cancelled (transición)
    expect(history.length).toBeGreaterThanOrEqual(2)
    const lastEntry = history.sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )[0]
    expect(lastEntry?.fromStatus).toBe('draft')
    expect(lastEntry?.toStatus).toBe('cancelled')
  })

  it('transición con comentario persiste el comment en el historial', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set(auth())
      .send({ status: 'cancelled', comment: 'El cliente lo pidió por teléfono' })

    const history = await db
      .select()
      .from(changeRequestHistory)
      .where(eq(changeRequestHistory.changeRequestId, crId))

    const withComment = history.filter((h) => h.comment != null)
    expect(withComment.length).toBeGreaterThanOrEqual(1)
    expect(withComment.at(-1)?.comment).toBe('El cliente lo pidió por teléfono')
  })

  it('transicionar a completed registra completedAt en la CR', async () => {
    const res = await createTestCR()
    const crId = res.body.data.id as string

    // Flujo: draft → sent (enviando una propuesta) → approved → completed
    await sendProposalFor(crId)
    for (const status of ['approved', 'completed']) {
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

    // Mover a "sent" enviando una propuesta
    await sendProposalFor(crId)

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

    await sendProposalFor(crId)

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
