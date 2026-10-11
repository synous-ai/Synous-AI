/**
 * review-fixes.test.ts — Guardias de tenant en createTask, filtro por
 * co-responsables (listTasks / focus / reports) e historial de cambios.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { company, contact, deal, hubUser, portal, recordHistory, task, taskAssignee } from '../../db/schema'
import { ensurePipeline, ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'
import { getFollowUps } from '../focus/focus.service'
import { getReports } from '../reports/reports.service'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let secondUserId: string
let foreign: { dealId: string; contactId: string; companyId: string }

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (body: unknown) => request(app.server).post('/api/tasks').set(auth()).send(body as object)

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)
  const [u2] = await db
    .insert(hubUser)
    .values({ portalId, email: `co-${randomUUID()}@test.com`, role: 'member', firstName: 'Co' })
    .returning()
  secondUserId = u2!.id

  const [other] = await db.insert(portal).values({ name: `Otro Portal Tareas FK ${randomUUID()}` }).returning()
  const pipe = await ensurePipeline(other!.id)
  const [d] = await db
    .insert(deal)
    .values({ portalId: other!.id, name: 'Deal ajeno', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    .returning()
  const [c] = await db.insert(contact).values({ portalId: other!.id, email: `c-${randomUUID()}@x.com` }).returning()
  const [co] = await db.insert(company).values({ portalId: other!.id, name: `Empresa ${randomUUID()}` }).returning()
  foreign = { dealId: d!.id, contactId: c!.id, companyId: co!.id }
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('createTask: guardia de FKs por tenant', () => {
  it.each([['dealId'], ['contactId'], ['companyId']] as const)('rechaza %s de otro portal', async (key) => {
    const res = await post({ title: 'X', [key]: foreign[key] })
    expect(res.status).toBe(400)
    const rows = await db.select().from(task).where(and(eq(task.portalId, portalId), eq(task.title, 'X'), eq(task.archived, false)))
    expect(rows.filter((r) => r[key] === foreign[key])).toHaveLength(0)
  })
})

describe('co-responsables ven sus tareas', () => {
  it('listTasks?assignedTo incluye tareas donde es co-responsable, no las ajenas', async () => {
    const shared = await post({ title: 'Compartida', assigneeIds: [userId, secondUserId] })
    const solo = await post({ title: 'Solo owner', assigneeIds: [userId] })
    const legacy = await post({ title: 'Legacy', assignedTo: secondUserId })

    const res = await request(app.server).get(`/api/tasks?assignedTo=${secondUserId}&limit=100`).set(auth())
    expect(res.status).toBe(200)
    const ids = (res.body.data as { id: string }[]).map((t) => t.id)
    expect(ids).toContain(shared.body.data.id)
    expect(ids).toContain(legacy.body.data.id)
    expect(ids).not.toContain(solo.body.data.id)
  })

  it('focus incluye la tarea del co-responsable', async () => {
    const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const created = await post({ title: 'Foco compartido', dueDate: due, assigneeIds: [userId, secondUserId] })
    const buckets = await getFollowUps(portalId, secondUserId)
    const all = [...buckets.overdue, ...buckets.today, ...buckets.upcoming]
    expect(all.map((t) => t.id)).toContain(created.body.data.id)
  })

  it('reports cuenta la tarea completada para cada responsable', async () => {
    const created = await post({ title: 'Reporte', status: 'completed', assigneeIds: [userId, secondUserId] })
    expect(created.status).toBe(201)
    const report = await getReports(portalId)
    const byUser = new Map(report.activityByUser.map((u) => [u.userId, u.tasksCompleted]))
    expect(byUser.get(secondUserId)).toBeGreaterThanOrEqual(1)
    expect(byUser.get(userId)).toBeGreaterThanOrEqual(1)
    const rows = await db.select().from(taskAssignee).where(eq(taskAssignee.taskId, created.body.data.id))
    expect(rows).toHaveLength(2)
  })
})

describe('historial de tareas', () => {
  it('PATCH registra cambios de status/priority/assignedTo en record_history', async () => {
    const created = await post({ title: 'Historial', assigneeIds: [userId] })
    const id = created.body.data.id as string
    const upd = await request(app.server)
      .patch(`/api/tasks/${id}`)
      .set(auth())
      .send({ status: 'in_review', priority: 'high', assigneeIds: [secondUserId] })
    expect(upd.status).toBe(200)
    const hist = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'task'), eq(recordHistory.entityId, id)))
    const byField = new Map(hist.map((h) => [h.fieldName, h]))
    expect(byField.get('status')).toMatchObject({ oldValue: 'pending', newValue: 'in_review', changedBy: userId })
    expect(byField.get('priority')).toMatchObject({ oldValue: 'medium', newValue: 'high' })
    expect(byField.get('assignedTo')).toMatchObject({ oldValue: userId, newValue: secondUserId })
  })
})
