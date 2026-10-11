/**
 * tasks-assignees.test.ts — Extensión de tareas para proyectos.
 *
 * Responsables múltiples (task_assignee) con dual-write sobre task.assigned_to,
 * checklist (steps), projectId con guardia de tenant y estado in_review.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { hubUser, portal, project, task, taskAssignee } from '../../db/schema'
import { ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let secondUserId: string
let projectId: string
let foreignProjectId: string
let foreignUserId: string

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (body: unknown) => request(app.server).post('/api/tasks').set(auth()).send(body as object)

async function assigneeRows(taskId: string): Promise<string[]> {
  const rows = await db.select().from(taskAssignee).where(eq(taskAssignee.taskId, taskId))
  return rows.map((r) => r.hubUserId).sort()
}

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)

  const [u2] = await db
    .insert(hubUser)
    .values({ portalId, email: `segundo-${randomUUID()}@test.com`, role: 'member', firstName: 'Segundo' })
    .returning()
  secondUserId = u2!.id
  const [p] = await db.insert(project).values({ portalId, name: 'Proyecto para tareas' }).returning()
  projectId = p!.id

  const [other] = await db.insert(portal).values({ name: `Otro Portal Tareas Proy ${randomUUID()}` }).returning()
  const [fp] = await db.insert(project).values({ portalId: other!.id, name: 'Proyecto ajeno' }).returning()
  foreignProjectId = fp!.id
  const [fu] = await db
    .insert(hubUser)
    .values({ portalId: other!.id, email: `ajeno-${randomUUID()}@test.com`, role: 'member' })
    .returning()
  foreignUserId = fu!.id
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('tareas con responsables múltiples', () => {
  it('assigneeIds hace dual-write: assigned_to = primero, task_assignee = todos', async () => {
    const res = await post({ title: 'Multi', assigneeIds: [secondUserId, userId], projectId })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const id = res.body.data.id as string
    expect(res.body.data.assignedTo).toBe(secondUserId)
    expect((res.body.data.assignees as { id: string }[]).map((a) => a.id).sort()).toEqual([userId, secondUserId].sort())
    expect(await assigneeRows(id)).toEqual([userId, secondUserId].sort())
    const [row] = await db.select().from(task).where(eq(task.id, id))
    expect(row!.assignedTo).toBe(secondUserId)
  })

  it('compat: solo assignedTo sincroniza task_assignee a [assignedTo]', async () => {
    const res = await post({ title: 'Legacy', assignedTo: userId })
    expect(res.status).toBe(201)
    expect(res.body.data.assignedTo).toBe(userId)
    expect(await assigneeRows(res.body.data.id)).toEqual([userId])
  })

  it('PATCH reemplaza el set; assigneeIds vacío deja assigned_to en null', async () => {
    const created = await post({ title: 'Patch', assigneeIds: [userId, secondUserId] })
    const id = created.body.data.id as string

    const one = await request(app.server).patch(`/api/tasks/${id}`).set(auth()).send({ assigneeIds: [secondUserId] })
    expect(one.status).toBe(200)
    expect(one.body.data.assignedTo).toBe(secondUserId)
    expect(await assigneeRows(id)).toEqual([secondUserId])

    const legacy = await request(app.server).patch(`/api/tasks/${id}`).set(auth()).send({ assignedTo: userId })
    expect(legacy.status).toBe(200)
    expect(await assigneeRows(id)).toEqual([userId])

    const none = await request(app.server).patch(`/api/tasks/${id}`).set(auth()).send({ assigneeIds: [] })
    expect(none.status).toBe(200)
    expect(none.body.data.assignedTo).toBeNull()
    expect(await assigneeRows(id)).toEqual([])
  })

  it('guardia de tenant: responsable o proyecto de otro portal se rechazan', async () => {
    const badUser = await post({ title: 'X', assigneeIds: [foreignUserId] })
    expect(badUser.status).toBe(400)
    const badLegacy = await post({ title: 'X', assignedTo: foreignUserId })
    expect(badLegacy.status).toBe(400)
    const badProject = await post({ title: 'X', projectId: foreignProjectId })
    expect(badProject.status).toBe(400)

    const created = await post({ title: 'Mia' })
    const patchUser = await request(app.server)
      .patch(`/api/tasks/${created.body.data.id}`)
      .set(auth())
      .send({ assigneeIds: [foreignUserId] })
    expect(patchUser.status).toBe(400)
    const patchProject = await request(app.server)
      .patch(`/api/tasks/${created.body.data.id}`)
      .set(auth())
      .send({ projectId: foreignProjectId })
    expect(patchProject.status).toBe(400)
  })
})

describe('tareas de proyecto', () => {
  it('acepta in_review y steps; normaliza done a false por defecto', async () => {
    const res = await post({
      title: 'Con checklist',
      projectId,
      status: 'in_review',
      steps: [{ text: 'a', children: [{ text: 'a1', done: true }] }, { text: 'b', done: true }],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.status).toBe('in_review')
    expect(res.body.data.steps).toEqual([
      { text: 'a', done: false, children: [{ text: 'a1', done: true }] },
      { text: 'b', done: true },
    ])

    const upd = await request(app.server)
      .patch(`/api/tasks/${res.body.data.id}`)
      .set(auth())
      .send({ steps: [{ text: 'a', done: true }] })
    expect(upd.status).toBe(200)
    expect(upd.body.data.steps).toEqual([{ text: 'a', done: true }])
    expect(new Date(upd.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(res.body.data.updatedAt).getTime())
  })

  it('rechaza steps con forma inválida', async () => {
    const res = await post({ title: 'Mal', steps: [{ text: '' }] })
    expect(res.status).toBe(400)
    const notArray = await post({ title: 'Mal', steps: 'x' })
    expect(notArray.status).toBe(400)
  })

  it('nuevas tareas del proyecto van al final de su columna', async () => {
    const [p] = await db.insert(project).values({ portalId, name: 'Orden' }).returning()
    const a = await post({ title: 'A', projectId: p!.id })
    const b = await post({ title: 'B', projectId: p!.id })
    expect(a.body.data.position).toBe(0)
    expect(b.body.data.position).toBe(1)
  })

  it('el listado filtra por projectId y devuelve assignees', async () => {
    const [p] = await db.insert(project).values({ portalId, name: 'Filtro' }).returning()
    const mine = await post({ title: 'En proyecto', projectId: p!.id, assigneeIds: [userId] })
    await post({ title: 'Suelta' })
    const res = await request(app.server).get(`/api/tasks?projectId=${p!.id}`).set(auth())
    expect(res.status).toBe(200)
    expect((res.body.data as { id: string }[]).map((t) => t.id)).toEqual([mine.body.data.id])
    expect(res.body.data[0].assignees.map((a: { id: string }) => a.id)).toEqual([userId])
  })
})
