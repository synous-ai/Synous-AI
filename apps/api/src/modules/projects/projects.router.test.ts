/**
 * projects.router.test.ts — Módulo de proyectos internos (integración HTTP).
 *
 * Cubre: copia de tareas del proceso al crear, guardias de tenant sobre FKs del
 * body, validación de fechas, mover/reordenar en el kanban, duplicado, archivo
 * y record_history en el PATCH.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  company,
  deal,
  hubUser,
  portal,
  processTask,
  processTemplate,
  project,
  recordHistory,
  task,
} from '../../db/schema'
import { ensurePipeline, ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let slug: string
let foreign: { companyId: string; dealId: string; userId: string; projectId: string; taskId: string }

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (url: string, body: unknown) => request(app.server).post(url).set(auth()).send(body as object)

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)

  // Proceso con 3 tareas en orden conocido (insertadas desordenadas a propósito).
  slug = `proc-${randomUUID().slice(0, 8)}`
  const [proc] = await db.insert(processTemplate).values({ portalId, slug, name: 'Proceso de test' }).returning()
  await db.insert(processTask).values([
    { processId: proc!.id, title: 'Tercera', position: 2, steps: [{ text: 'c1', done: true, children: [{ text: 'c1a', done: true }] }] },
    { processId: proc!.id, title: 'Primera', position: 0, steps: [{ text: 'a1', done: true }, { text: 'a2' }] },
    { processId: proc!.id, title: 'Segunda', position: 1, notes: 'nota de la segunda' },
  ])

  // Datos de OTRO portal para probar las guardias de tenant.
  const [other] = await db.insert(portal).values({ name: `Otro Portal Proyectos ${randomUUID()}` }).returning()
  const [c] = await db.insert(company).values({ portalId: other!.id, name: `Empresa ajena ${randomUUID()}` }).returning()
  const pipe = await ensurePipeline(other!.id)
  const [d] = await db
    .insert(deal)
    .values({ portalId: other!.id, name: 'Deal ajeno', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    .returning()
  const [u] = await db
    .insert(hubUser)
    .values({ portalId: other!.id, email: `ajeno-${randomUUID()}@test.com`, role: 'member', firstName: 'Ajeno' })
    .returning()
  const [p] = await db.insert(project).values({ portalId: other!.id, name: 'Proyecto ajeno' }).returning()
  const [t] = await db.insert(task).values({ portalId: other!.id, projectId: p!.id, title: 'Tarea ajena' }).returning()
  foreign = { companyId: c!.id, dealId: d!.id, userId: u!.id, projectId: p!.id, taskId: t!.id }
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

async function createProject(extra: Record<string, unknown> = {}) {
  const res = await post('/api/projects', { name: `Proyecto ${randomUUID().slice(0, 6)}`, startDate: '2026-01-10', ...extra })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { id: string; name: string; members: { id: string }[] } & Record<string, unknown>
}

async function tasksOf(projectId: string) {
  const res = await request(app.server).get(`/api/projects/${projectId}/tasks`).set(auth())
  expect(res.status).toBe(200)
  return res.body.data as { id: string; title: string; status: string; position: number; steps: unknown[] }[]
}

describe('POST /api/projects', () => {
  it('copia las tareas del proceso en orden de posición, con checklist reiniciada', async () => {
    const created = await createProject({ kind: slug, memberIds: [userId] })
    expect(created.members.map((m) => m.id)).toEqual([userId])

    const tasks = (await tasksOf(created.id)).sort((a, b) => a.position - b.position)
    expect(tasks.map((t) => t.title)).toEqual(['Primera', 'Segunda', 'Tercera'])
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2])
    expect(tasks.every((t) => t.status === 'pending')).toBe(true)
    expect(tasks[0]!.steps).toEqual([
      { text: 'a1', done: false },
      { text: 'a2', done: false },
    ])
    expect(tasks[2]!.steps).toEqual([{ text: 'c1', done: false, children: [{ text: 'c1a', done: false }] }])
  })

  it('es una copia, no una referencia: editar la plantilla no toca el proyecto', async () => {
    const created = await createProject({ kind: slug })
    const [proc] = await db.select().from(processTemplate).where(and(eq(processTemplate.portalId, portalId), eq(processTemplate.slug, slug)))
    await db.update(processTask).set({ title: 'Primera (editada)' }).where(eq(processTask.processId, proc!.id))
    const titles = (await tasksOf(created.id)).map((t) => t.title)
    expect(titles).not.toContain('Primera (editada)')
    await db.update(processTask).set({ title: 'Primera' }).where(and(eq(processTask.processId, proc!.id), eq(processTask.position, 0)))
  })

  it('rechaza un kind sin proceso asociado en el portal', async () => {
    const res = await post('/api/projects', { name: 'X', startDate: '2026-01-01', kind: 'no-existe' })
    expect(res.status).toBe(400)
  })

  it('rechaza startDate posterior a dueDate y exige startDate', async () => {
    const bad = await post('/api/projects', { name: 'X', startDate: '2026-03-01', dueDate: '2026-02-01' })
    expect(bad.status).toBe(400)
    const missing = await post('/api/projects', { name: 'X' })
    expect(missing.status).toBe(400)
    const impossible = await post('/api/projects', { name: 'X', startDate: '2026-02-31' })
    expect(impossible.status).toBe(400)
  })

  it('rechaza URLs que no son http(s)', async () => {
    const res = await post('/api/projects', { name: 'X', startDate: '2026-01-01', repoUrl: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
  })

  it('guardia de tenant: empresa, deal y miembro de otro portal se rechazan sin crear nada', async () => {
    const before = await db.select({ id: project.id }).from(project).where(eq(project.portalId, portalId))
    for (const extra of [
      { companyId: foreign.companyId },
      { dealId: foreign.dealId },
      { memberIds: [foreign.userId] },
    ]) {
      const res = await post('/api/projects', { name: 'Intruso', startDate: '2026-01-01', ...extra })
      expect(res.status, JSON.stringify(extra)).toBe(400)
    }
    const after = await db.select({ id: project.id }).from(project).where(eq(project.portalId, portalId))
    expect(after.length).toBe(before.length)
  })

  it('un fallo en la transacción no deja proyecto a medias (miembro inválido tras proceso válido)', async () => {
    const res = await post('/api/projects', { name: 'Atomico', startDate: '2026-01-01', kind: slug, memberIds: [foreign.userId] })
    expect(res.status).toBe(400)
    const rows = await db.select().from(project).where(and(eq(project.portalId, portalId), eq(project.name, 'Atomico')))
    expect(rows).toHaveLength(0)
  })
})

describe('PATCH /api/projects/:id', () => {
  it('actualiza, reemplaza miembros y registra record_history', async () => {
    const created = await createProject({ memberIds: [userId] })
    const res = await request(app.server)
      .patch(`/api/projects/${created.id}`)
      .set(auth())
      .send({ status: 'in_progress', memberIds: [], repoUrl: 'https://github.com/synous/demo' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('in_progress')
    expect(res.body.data.members).toEqual([])

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'project'), eq(recordHistory.entityId, created.id)))
    const statusChange = history.find((h) => h.fieldName === 'status')
    expect(statusChange).toMatchObject({ oldValue: 'not_started', newValue: 'in_progress', changedBy: userId })
  })

  it('revalida el orden de fechas contra el valor guardado', async () => {
    const created = await createProject({ startDate: '2026-05-10' })
    const res = await request(app.server).patch(`/api/projects/${created.id}`).set(auth()).send({ dueDate: '2026-05-01' })
    expect(res.status).toBe(400)
  })

  it('guardia de tenant en PATCH', async () => {
    const created = await createProject()
    for (const body of [{ companyId: foreign.companyId }, { dealId: foreign.dealId }, { memberIds: [foreign.userId] }]) {
      const res = await request(app.server).patch(`/api/projects/${created.id}`).set(auth()).send(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('no puede tocar ni leer un proyecto de otro portal (404)', async () => {
    const patch = await request(app.server).patch(`/api/projects/${foreign.projectId}`).set(auth()).send({ name: 'hack' })
    expect(patch.status).toBe(404)
    const get = await request(app.server).get(`/api/projects/${foreign.projectId}`).set(auth())
    expect(get.status).toBe(404)
  })
})

describe('kanban: POST /api/projects/:id/tasks/move', () => {
  it('cambia el status y reescribe las posiciones según orderedIds', async () => {
    const created = await createProject({ kind: slug })
    const tasks = (await tasksOf(created.id)).sort((a, b) => a.position - b.position)
    const [a, b, c] = tasks as [(typeof tasks)[number], (typeof tasks)[number], (typeof tasks)[number]]

    const res = await post(`/api/projects/${created.id}/tasks/move`, {
      taskId: c.id,
      status: 'in_progress',
      orderedIds: [c.id, a.id, b.id],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const after = new Map((res.body.data as typeof tasks).map((t) => [t.id, t]))
    expect(after.get(c.id)).toMatchObject({ status: 'in_progress', position: 0 })
    expect(after.get(a.id)).toMatchObject({ status: 'pending', position: 1 })
    expect(after.get(b.id)).toMatchObject({ status: 'pending', position: 2 })
  })

  it('completed setea completedAt', async () => {
    const created = await createProject({ kind: slug })
    const [first] = await tasksOf(created.id)
    const res = await post(`/api/projects/${created.id}/tasks/move`, {
      taskId: first!.id,
      status: 'completed',
      orderedIds: [first!.id],
    })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(task).where(eq(task.id, first!.id))
    expect(row!.completedAt).not.toBeNull()
  })

  it('rechaza ids de tareas de otro proyecto/portal sin modificar nada', async () => {
    const created = await createProject({ kind: slug })
    const mine = await tasksOf(created.id)
    const res = await post(`/api/projects/${created.id}/tasks/move`, {
      taskId: mine[0]!.id,
      status: 'in_review',
      orderedIds: [mine[0]!.id, foreign.taskId],
    })
    expect(res.status).toBe(400)
    const [foreignRow] = await db.select().from(task).where(eq(task.id, foreign.taskId))
    expect(foreignRow!.status).toBe('pending')
    const unchanged = await tasksOf(created.id)
    expect(unchanged.every((t) => t.status === 'pending')).toBe(true)
  })

  it('rechaza orderedIds sin taskId o con ids repetidos', async () => {
    const created = await createProject({ kind: slug })
    const mine = await tasksOf(created.id)
    const missing = await post(`/api/projects/${created.id}/tasks/move`, {
      taskId: mine[0]!.id,
      status: 'pending',
      orderedIds: [mine[1]!.id],
    })
    expect(missing.status).toBe(400)
    const dup = await post(`/api/projects/${created.id}/tasks/move`, {
      taskId: mine[0]!.id,
      status: 'pending',
      orderedIds: [mine[0]!.id, mine[0]!.id],
    })
    expect(dup.status).toBe(400)
  })
})

describe('POST /api/projects/:id/duplicate', () => {
  it('copia con sufijo, sin fechas, tareas en pending con checklist reiniciada y mismos miembros', async () => {
    const created = await createProject({
      kind: slug,
      memberIds: [userId],
      status: 'in_progress',
      dueDate: '2026-06-01',
      productionUrl: 'https://prod.example.com',
    })
    const [t] = await tasksOf(created.id)
    await db
      .update(task)
      .set({ status: 'completed', steps: [{ text: 'hecho', done: true }] })
      .where(eq(task.id, t!.id))

    const res = await post(`/api/projects/${created.id}/duplicate`, {})
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const copy = res.body.data
    expect(copy.id).not.toBe(created.id)
    expect(copy.name).toBe(`${created.name} (copia)`)
    expect(copy).toMatchObject({ status: 'not_started', startDate: null, dueDate: null, productionUrl: null })
    expect(copy.members.map((m: { id: string }) => m.id)).toEqual([userId])

    const copied = await tasksOf(copy.id)
    expect(copied).toHaveLength(3)
    expect(copied.every((x) => x.status === 'pending')).toBe(true)
    expect(JSON.stringify(copied.map((x) => x.steps))).not.toContain('"done":true')

    // El original no cambió.
    const original = await tasksOf(created.id)
    expect(original.find((x) => x.id === t!.id)!.status).toBe('completed')
  })
})

describe('archivo y listado', () => {
  it('DELETE archiva y lo saca del listado (includeArchived lo devuelve)', async () => {
    const created = await createProject({ name: `Archivable ${randomUUID()}` })
    const del = await request(app.server).delete(`/api/projects/${created.id}`).set(auth())
    expect(del.status).toBe(200)

    const [row] = await db.select().from(project).where(eq(project.id, created.id))
    expect(row).toMatchObject({ archived: true })
    expect(row!.archivedAt).not.toBeNull()

    const list = await request(app.server).get('/api/projects?limit=100').set(auth())
    expect(list.status).toBe(200)
    expect((list.body.data as { id: string }[]).some((p) => p.id === created.id)).toBe(false)

    const withArchived = await request(app.server).get('/api/projects?limit=100&includeArchived=true').set(auth())
    expect((withArchived.body.data as { id: string }[]).some((p) => p.id === created.id)).toBe(true)

    const detail = await request(app.server).get(`/api/projects/${created.id}`).set(auth())
    expect(detail.status).toBe(404)
  })

  it('el listado trae miembros, conteo de tareas y filtra por memberId/status', async () => {
    const created = await createProject({ kind: slug, memberIds: [userId], status: 'in_review' })
    const [t] = await tasksOf(created.id)
    await db.update(task).set({ status: 'completed' }).where(eq(task.id, t!.id))

    const res = await request(app.server)
      .get(`/api/projects?limit=100&memberId=${userId}&status=in_review`)
      .set(auth())
    expect(res.status).toBe(200)
    const item = (res.body.data as { id: string; taskCounts: unknown; members: { id: string }[] }[]).find((p) => p.id === created.id)
    expect(item).toBeDefined()
    expect(item!.taskCounts).toEqual({ total: 3, open: 2, completed: 1 })
    expect(item!.members.map((m) => m.id)).toEqual([userId])
    // Nunca aparecen proyectos del otro portal.
    expect((res.body.data as { id: string }[]).some((p) => p.id === foreign.projectId)).toBe(false)
  })
})
