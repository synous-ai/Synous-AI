/**
 * review-fixes.test.ts (projects) — archivo en cascada de tareas, PATCH con
 * `kind` sin cambios sobre un proceso archivado e historial (miembros / kanban).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { hubUser, processTemplate, recordHistory, task } from '../../db/schema'
import { ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let otherUserId: string

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (url: string, body: unknown) => request(app.server).post(url).set(auth()).send(body as object)
const patch = (url: string, body: unknown) => request(app.server).patch(url).set(auth()).send(body as object)

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)
  const [u] = await db
    .insert(hubUser)
    .values({ portalId, email: `m-${randomUUID()}@test.com`, role: 'member', firstName: 'Miembro' })
    .returning()
  otherUserId = u!.id
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

async function mkProject(extra: Record<string, unknown> = {}) {
  const res = await post('/api/projects', { name: `P ${randomUUID().slice(0, 6)}`, startDate: '2026-01-10', ...extra })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data as { id: string }
}

describe('archivar proyecto', () => {
  it('archiva también sus tareas (salen de los listados globales)', async () => {
    const p = await mkProject()
    const t1 = await post('/api/tasks', { title: 'T1', projectId: p.id })
    const t2 = await post('/api/tasks', { title: 'T2', projectId: p.id })
    const loose = await post('/api/tasks', { title: 'Suelta' })

    const del = await request(app.server).delete(`/api/projects/${p.id}`).set(auth())
    expect(del.status).toBe(200)

    const rows = await db.select().from(task).where(eq(task.projectId, p.id))
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.archived).toBe(true)
      expect(r.archivedAt).not.toBeNull()
    }
    const list = await request(app.server).get('/api/tasks?limit=100').set(auth())
    const ids = (list.body.data as { id: string }[]).map((t) => t.id)
    expect(ids).not.toContain(t1.body.data.id)
    expect(ids).not.toContain(t2.body.data.id)
    expect(ids).toContain(loose.body.data.id)
  })
})

describe('PATCH con kind sin cambios', () => {
  it('no revalida el proceso si kind no cambia, aunque el proceso esté archivado', async () => {
    const slug = `arch-${randomUUID().slice(0, 8)}`
    const [proc] = await db.insert(processTemplate).values({ portalId, slug, name: 'Se archivará' }).returning()
    const p = await mkProject({ kind: slug })
    await db.update(processTemplate).set({ archived: true }).where(eq(processTemplate.id, proc!.id))

    const same = await patch(`/api/projects/${p.id}`, { kind: slug, name: 'Renombrado' })
    expect(same.status, JSON.stringify(same.body)).toBe(200)
    expect(same.body.data.name).toBe('Renombrado')

    const other = await mkProject()
    const changed = await patch(`/api/projects/${other.id}`, { kind: slug })
    expect(changed.status).toBe(400)
  })
})

describe('historial', () => {
  it('PATCH de memberIds registra el cambio en record_history', async () => {
    const p = await mkProject({ memberIds: [userId] })
    const upd = await patch(`/api/projects/${p.id}`, { memberIds: [userId, otherUserId] })
    expect(upd.status).toBe(200)
    const hist = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'project'), eq(recordHistory.entityId, p.id), eq(recordHistory.fieldName, 'memberIds')))
    expect(hist).toHaveLength(1)
    expect(JSON.parse(hist[0]!.oldValue!)).toEqual([userId])
    expect(JSON.parse(hist[0]!.newValue!)).toEqual([userId, otherUserId].sort())
    expect(hist[0]!.changedBy).toBe(userId)

    // Mismo set: no escribe una fila nueva.
    await patch(`/api/projects/${p.id}`, { memberIds: [otherUserId, userId] })
    const again = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityId, p.id), eq(recordHistory.fieldName, 'memberIds')))
    expect(again).toHaveLength(1)
  })

  it('mover una tarea en el kanban registra el cambio de status', async () => {
    const p = await mkProject()
    const t = await post('/api/tasks', { title: 'Kanban', projectId: p.id })
    const id = t.body.data.id as string
    const mv = await post(`/api/projects/${p.id}/tasks/move`, { taskId: id, status: 'in_progress', orderedIds: [id] })
    expect(mv.status, JSON.stringify(mv.body)).toBe(200)
    const hist = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'task'), eq(recordHistory.entityId, id), eq(recordHistory.fieldName, 'status')))
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ oldValue: 'pending', newValue: 'in_progress', changedBy: userId })
  })
})
