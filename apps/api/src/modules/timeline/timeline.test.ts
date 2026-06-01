import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { ensurePortalAndUser, ensurePipeline, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let dealId: number

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  token = await loginToken(app, ctx.email, ctx.password)

  // Crear un deal para asociar las actividades
  const pipe = await ensurePipeline(ctx.portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      name: 'Deal timeline tests',
      pipelineId: pipe.pipelineId,
      stageId: pipe.firstStageId,
    })
  dealId = dealRes.body.data.id as number
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

// ── logCall ───────────────────────────────────────────────────────────────────

describe('timeline — logCall', () => {
  it('crea una llamada y el getTimeline la devuelve con kind=call', async () => {
    const callRes = await request(app.server)
      .post('/api/timeline/calls')
      .set(auth())
      .send({
        title: 'Llamada de seguimiento',
        direction: 'outbound',
        durationSec: 300,
        dealId,
      })
    expect(callRes.status).toBe(201)
    expect(callRes.body.data.id).toBeTruthy()
    expect(callRes.body.data.direction).toBe('outbound')

    const timeline = await request(app.server)
      .get('/api/timeline')
      .set(auth())
      .query({ dealId })
    expect(timeline.status).toBe(200)

    const calls = timeline.body.data.filter((i: { kind: string }) => i.kind === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const found = calls.find(
      (c: { meta: { direction: string } }) => c.meta?.direction === 'outbound',
    )
    expect(found).toBeDefined()
  })

  it('rechaza una llamada sin dealId ni contactId (400)', async () => {
    const res = await request(app.server)
      .post('/api/timeline/calls')
      .set(auth())
      .send({ title: 'Sin asociación' })
    expect(res.status).toBe(400)
  })
})

// ── logMeeting ────────────────────────────────────────────────────────────────

describe('timeline — logMeeting', () => {
  it('crea una reunión y el getTimeline la devuelve con kind=meeting', async () => {
    const meetRes = await request(app.server)
      .post('/api/timeline/meetings')
      .set(auth())
      .send({
        title: 'Kickoff del proyecto',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        location: 'Zoom',
        dealId,
      })
    expect(meetRes.status).toBe(201)
    expect(meetRes.body.data.id).toBeTruthy()
    expect(meetRes.body.data.title).toBe('Kickoff del proyecto')

    const timeline = await request(app.server)
      .get('/api/timeline')
      .set(auth())
      .query({ dealId })
    expect(timeline.status).toBe(200)

    const meetings = timeline.body.data.filter((i: { kind: string }) => i.kind === 'meeting')
    expect(meetings.length).toBeGreaterThanOrEqual(1)
    const found = meetings.find((m: { title: string }) => m.title === 'Kickoff del proyecto')
    expect(found).toBeDefined()
    expect(found.meta?.location).toBe('Zoom')
  })
})

// ── logEmail ──────────────────────────────────────────────────────────────────

describe('timeline — logEmail', () => {
  it('crea un email y el getTimeline lo devuelve con kind=email', async () => {
    const emailRes = await request(app.server)
      .post('/api/timeline/emails')
      .set(auth())
      .send({
        fromEmail: 'carlos@devduo.com',
        toEmail: 'cliente@empresa.com',
        subject: 'Propuesta actualizada',
        dealId,
      })
    expect(emailRes.status).toBe(201)
    expect(emailRes.body.data.id).toBeTruthy()
    expect(emailRes.body.data.subject).toBe('Propuesta actualizada')

    const timeline = await request(app.server)
      .get('/api/timeline')
      .set(auth())
      .query({ dealId })
    expect(timeline.status).toBe(200)

    const emails = timeline.body.data.filter((i: { kind: string }) => i.kind === 'email')
    expect(emails.length).toBeGreaterThanOrEqual(1)
    const found = emails.find((e: { title: string }) => e.title === 'Propuesta actualizada')
    expect(found).toBeDefined()
    expect(found.meta?.fromEmail).toBe('carlos@devduo.com')
  })
})

// ── Orden desc por fecha ──────────────────────────────────────────────────────

describe('timeline — ordenamiento por fecha DESC', () => {
  it('los items del timeline están ordenados por occurredAt desc', async () => {
    // Crear call con fecha vieja y call con fecha reciente
    await request(app.server)
      .post('/api/timeline/calls')
      .set(auth())
      .send({
        title: 'Llamada antigua',
        occurredAt: '2025-01-01T09:00:00.000Z',
        dealId,
      })

    await request(app.server)
      .post('/api/timeline/calls')
      .set(auth())
      .send({
        title: 'Llamada reciente',
        occurredAt: '2026-05-30T09:00:00.000Z',
        dealId,
      })

    const timeline = await request(app.server)
      .get('/api/timeline')
      .set(auth())
      .query({ dealId })
    expect(timeline.status).toBe(200)

    const items = timeline.body.data as Array<{ occurredAt: string }>
    // Verificar orden descendente: cada item debe ser >= el siguiente
    for (let i = 0; i < items.length - 1; i++) {
      const current = new Date(items[i]!.occurredAt).getTime()
      const next = new Date(items[i + 1]!.occurredAt).getTime()
      expect(current).toBeGreaterThanOrEqual(next)
    }
  })
})

// ── GET /timeline requiere exactamente un filtro ──────────────────────────────

describe('timeline — validación de query params', () => {
  it('GET sin filtros devuelve 400', async () => {
    const res = await request(app.server).get('/api/timeline').set(auth())
    expect(res.status).toBe(400)
  })

  it('GET sin token devuelve 401', async () => {
    const res = await request(app.server)
      .get('/api/timeline')
      .query({ dealId })
    expect(res.status).toBe(401)
  })
})
