import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { task } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let dealId: string

// Fechas fijas para tests deterministas (relativas a "now" en UTC)
const now = new Date('2026-06-01T12:00:00.000Z')
const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000)  // 25h atrás = ayer
const tomorrow = new Date(now.getTime() + 25 * 60 * 60 * 1000)   // 25h adelante = mañana
const fiveDaysOut = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)

  // Crear un deal para asociar tareas
  const pipe = await ensurePipeline(portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      name: 'Deal focus tests',
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

// ── getFollowUps — bucketización ──────────────────────────────────────────────

describe('focus — getFollowUps bucketización', () => {
  it('una tarea con dueDate pasado aparece en overdue', async () => {
    // Insertar directamente en DB para controlar fechas exactas
    await db.insert(task).values({
      portalId,
      createdBy: userId,
      title: 'Tarea vencida focus test',
      status: 'pending',
      priority: 'high',
      dueDate: yesterday,
      dealId,
    })

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const overdue = res.body.data.followUps.overdue as Array<{ title: string }>
    const found = overdue.find((t) => t.title === 'Tarea vencida focus test')
    expect(found).toBeDefined()
  })

  it('una tarea con dueDate en los próximos 7 días aparece en upcoming', async () => {
    await db.insert(task).values({
      portalId,
      createdBy: userId,
      title: 'Tarea próxima focus test',
      status: 'pending',
      priority: 'medium',
      dueDate: fiveDaysOut,
      dealId,
    })

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const upcoming = res.body.data.followUps.upcoming as Array<{ title: string }>
    const found = upcoming.find((t) => t.title === 'Tarea próxima focus test')
    expect(found).toBeDefined()
  })

  it('una tarea completada no aparece en follow-ups', async () => {
    await db.insert(task).values({
      portalId,
      createdBy: userId,
      title: 'Tarea completada focus test',
      status: 'completed',
      priority: 'low',
      dueDate: yesterday,
      dealId,
    })

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const allItems = [
      ...res.body.data.followUps.overdue,
      ...res.body.data.followUps.today,
      ...res.body.data.followUps.upcoming,
    ] as Array<{ title: string }>

    const found = allItems.find((t) => t.title === 'Tarea completada focus test')
    expect(found).toBeUndefined()
  })

  it('una tarea sin dueDate no aparece en follow-ups', async () => {
    await db.insert(task).values({
      portalId,
      createdBy: userId,
      title: 'Tarea sin fecha focus test',
      status: 'pending',
      priority: 'low',
      dealId,
    })

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const allItems = [
      ...res.body.data.followUps.overdue,
      ...res.body.data.followUps.today,
      ...res.body.data.followUps.upcoming,
    ] as Array<{ title: string }>

    const found = allItems.find((t) => t.title === 'Tarea sin fecha focus test')
    expect(found).toBeUndefined()
  })
})

// ── getDealsNeedingAttention ──────────────────────────────────────────────────

describe('focus — getDealsNeedingAttention', () => {
  it('un deal sin tareas abiertas aparece en noNextAction', async () => {
    // El dealId creado en beforeAll no tiene tareas abiertas asociadas
    // (todas las que creamos arriba son `pending` pero podrían estar ahí)
    // Creamos un deal completamente limpio para este test.
    const pipe = await ensurePipeline(portalId)
    const freshDealRes = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({
        name: 'Deal sin tareas attention test',
        pipelineId: pipe.pipelineId,
        stageId: pipe.firstStageId,
      })
    expect(freshDealRes.status).toBe(201)
    const freshDealId = freshDealRes.body.data.id as string

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const noNextAction = res.body.data.attention.noNextAction as Array<{ id: string }>
    const found = noNextAction.find((d) => d.id === freshDealId)
    expect(found).toBeDefined()
  })

  it('un deal con tarea abierta NO aparece en noNextAction', async () => {
    const pipe = await ensurePipeline(portalId)
    const dealRes = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({
        name: 'Deal con tarea abierta attention test',
        pipelineId: pipe.pipelineId,
        stageId: pipe.firstStageId,
      })
    const newDealId = dealRes.body.data.id as string

    // Agregar tarea abierta
    await db.insert(task).values({
      portalId,
      createdBy: userId,
      title: 'Tarea abierta atención',
      status: 'pending',
      priority: 'medium',
      dueDate: tomorrow,
      dealId: newDealId,
    })

    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const noNextAction = res.body.data.attention.noNextAction as Array<{ id: string }>
    const found = noNextAction.find((d) => d.id === newDealId)
    expect(found).toBeUndefined()
  })

  it('la respuesta tiene la estructura esperada { followUps, attention }', async () => {
    const res = await request(app.server).get('/api/focus').set(auth())
    expect(res.status).toBe(200)

    const data = res.body.data
    expect(data).toHaveProperty('followUps')
    expect(data.followUps).toHaveProperty('overdue')
    expect(data.followUps).toHaveProperty('today')
    expect(data.followUps).toHaveProperty('upcoming')
    expect(data).toHaveProperty('attention')
    expect(data.attention).toHaveProperty('noNextAction')
    expect(data.attention).toHaveProperty('stale')
    expect(Array.isArray(data.followUps.overdue)).toBe(true)
    expect(Array.isArray(data.followUps.today)).toBe(true)
    expect(Array.isArray(data.followUps.upcoming)).toBe(true)
    expect(Array.isArray(data.attention.noNextAction)).toBe(true)
    expect(Array.isArray(data.attention.stale)).toBe(true)
  })
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('focus — autenticación requerida', () => {
  it('GET /focus sin token devuelve 401', async () => {
    const res = await request(app.server).get('/api/focus')
    expect(res.status).toBe(401)
  })
})
