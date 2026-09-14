/**
 * activities.test.ts — Soft delete de notas y tareas.
 *
 * DELETE /api/notes/:id y DELETE /api/tasks/:id archivan (archived + archived_at)
 * en vez de borrar. Estos tests fijan que el registro archivado desaparece de
 * TODAS las lecturas (listados, detalles, timeline, dashboard, foco y el scan de
 * recordatorios), que queda la fila en audit_log y que el contrato HTTP del
 * delete no cambió.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { auditLog, note, notification, portal, task } from '../../db/schema'
import { runReminderScan } from '../../jobs/reminders.service'
import { ensurePortalAndUser, ensurePipeline, loginToken, listenForSupertest } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string
let userId: string
let dealId: string
let contactId: string
let companyId: string

const auth = () => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  token = await loginToken(app, ctx.email, ctx.password)

  const pipe = await ensurePipeline(portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set(auth())
    .send({ name: 'Deal soft delete actividades', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
  dealId = dealRes.body.data.id as string

  const contactRes = await request(app.server)
    .post('/api/contacts')
    .set(auth())
    .send({ firstName: 'Contacto', lastName: 'Soft delete', email: `soft-${randomUUID()}@test.com` })
  contactId = contactRes.body.data.id as string

  const companyRes = await request(app.server)
    .post('/api/companies')
    .set(auth())
    .send({ name: `Empresa soft delete ${randomUUID()}` })
  companyId = companyRes.body.data.id as string
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

function createNote(body: string) {
  return request(app.server).post('/api/notes').set(auth()).send({ body, dealId, contactId, companyId })
}

function createTask(title: string, dueDate?: Date, linked = true) {
  return request(app.server)
    .post('/api/tasks')
    .set(auth())
    .send({
      title,
      status: 'pending',
      dueDate: dueDate?.toISOString(),
      ...(linked ? { dealId, contactId, companyId } : {}),
    })
}

/** El id no aparece en ningún lugar del body — independiente de la forma de cada endpoint. */
function expectAbsent(body: unknown, id: string): void {
  expect(JSON.stringify(body)).not.toContain(id)
}

async function readAllViews(): Promise<unknown[]> {
  const [dealDetail, contactDetail, companyDetail, timeline, dashboard, focus] = await Promise.all([
    request(app.server).get(`/api/deals/${dealId}/detail`).set(auth()),
    request(app.server).get(`/api/contacts/${contactId}/detail`).set(auth()),
    request(app.server).get(`/api/companies/${companyId}/detail`).set(auth()),
    request(app.server).get('/api/timeline').query({ dealId }).set(auth()),
    request(app.server).get('/api/dashboard').set(auth()),
    request(app.server).get('/api/focus').set(auth()),
  ])
  for (const res of [dealDetail, contactDetail, companyDetail, timeline, dashboard, focus]) {
    expect(res.status).toBe(200)
  }
  return [dealDetail.body, contactDetail.body, companyDetail.body, timeline.body, dashboard.body, focus.body]
}

describe('notas — soft delete', () => {
  it('DELETE archiva la nota: responde igual, deja audit_log y la nota desaparece de listados, detalles y timeline', async () => {
    const created = await createNote('Nota que se va a archivar')
    expect(created.status).toBe(201)
    const noteId = created.body.data.id as string

    // Control positivo: antes de archivar se ve en todas las vistas que la muestran.
    const before = await readAllViews()
    for (const body of before.slice(0, 4)) expect(JSON.stringify(body)).toContain(noteId)

    const del = await request(app.server).delete(`/api/notes/${noteId}`).set(auth())
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ data: { success: true } })

    const [row] = await db.select().from(note).where(eq(note.id, noteId))
    expect(row?.archived).toBe(true)
    expect(row?.archivedAt).toBeInstanceOf(Date)

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'note'), eq(auditLog.entityId, noteId), eq(auditLog.action, 'ARCHIVE')))
    expect(audit).toHaveLength(1)

    const list = await request(app.server).get('/api/notes').query({ dealId }).set(auth())
    expect(list.status).toBe(200)
    expectAbsent(list.body, noteId)
    for (const body of await readAllViews()) expectAbsent(body, noteId)

    // Archivar dos veces no existe: la segunda es 404.
    const again = await request(app.server).delete(`/api/notes/${noteId}`).set(auth())
    expect(again.status).toBe(404)
  })

  it('DELETE de una nota de otro portal → 404 y la nota queda intacta', async () => {
    const [other] = await db.insert(portal).values({ name: `Otro Portal Notas ${randomUUID()}` }).returning()
    const [foreign] = await db.insert(note).values({ portalId: other!.id, body: 'Nota ajena' }).returning()

    const res = await request(app.server).delete(`/api/notes/${foreign!.id}`).set(auth())
    expect(res.status).toBe(404)

    const [row] = await db.select().from(note).where(eq(note.id, foreign!.id))
    expect(row?.archived).toBe(false)
  })
})

describe('reportes — actividad por usuario', () => {
  it('las notas y tareas archivadas no cuentan en activityByUser', async () => {
    const readCounts = async (): Promise<{ notes: number; tasksCreated: number; tasksCompleted: number }> => {
      const res = await request(app.server)
        .get('/api/reports')
        .query({ from: new Date(Date.now() - 60 * 60 * 1000).toISOString(), to: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
        .set(auth())
      expect(res.status).toBe(200)
      const rows = res.body.data.activityByUser as Array<{ notes: number; tasksCreated: number; tasksCompleted: number }>
      const mine = rows.find((r) => JSON.stringify(r).includes(userId))
      if (!mine) throw new Error('El owner de tests no aparece en activityByUser')
      return mine
    }

    const n = await createNote('Nota para reportes')
    // tasksCompleted cuenta por asignado, no por creador.
    const t = await request(app.server)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'Tarea para reportes', assignedTo: userId })
      .expect(201)
    await request(app.server).patch(`/api/tasks/${t.body.data.id}`).set(auth()).send({ status: 'completed' }).expect(200)

    const before = await readCounts()
    await request(app.server).delete(`/api/notes/${n.body.data.id}`).set(auth()).expect(200)
    await request(app.server).delete(`/api/tasks/${t.body.data.id}`).set(auth()).expect(200)
    const after = await readCounts()

    expect(after.notes).toBe(before.notes - 1)
    expect(after.tasksCreated).toBe(before.tasksCreated - 1)
    expect(after.tasksCompleted).toBe(before.tasksCompleted - 1)
  })
})

describe('tareas — soft delete', () => {
  it('DELETE archiva la tarea: responde igual, deja audit_log y desaparece de listados, detalles, timeline, dashboard y foco', async () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const created = await createTask('Tarea que se va a archivar', yesterday)
    expect(created.status).toBe(201)
    const taskId = created.body.data.id as string

    const dashBefore = await request(app.server).get('/api/dashboard').set(auth())
    const openBefore = dashBefore.body.data.counts.openTasks as number
    const before = await readAllViews()
    // deal, contacto, empresa, timeline y foco (vencida) la muestran antes de archivar.
    for (const body of [...before.slice(0, 4), before[5]]) expect(JSON.stringify(body)).toContain(taskId)

    const del = await request(app.server).delete(`/api/tasks/${taskId}`).set(auth())
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ data: { success: true } })

    const [row] = await db.select().from(task).where(eq(task.id, taskId))
    expect(row?.archived).toBe(true)
    expect(row?.archivedAt).toBeInstanceOf(Date)

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'task'), eq(auditLog.entityId, taskId), eq(auditLog.action, 'ARCHIVE')))
    expect(audit).toHaveLength(1)

    const list = await request(app.server).get('/api/tasks').query({ dealId }).set(auth())
    expect(list.status).toBe(200)
    expectAbsent(list.body, taskId)
    for (const body of await readAllViews()) expectAbsent(body, taskId)

    const dashAfter = await request(app.server).get('/api/dashboard').set(auth())
    expect(dashAfter.body.data.counts.openTasks).toBe(openBefore - 1)

    // Una tarea archivada tampoco se puede editar.
    const patch = await request(app.server).patch(`/api/tasks/${taskId}`).set(auth()).send({ title: 'Revivida' })
    expect(patch.status).toBe(404)
  })

  it('el scan de recordatorios no notifica tareas archivadas (y sí las vigentes)', async () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    // Sin entidad vinculada: la notificación task_due usa el id de la propia tarea como entity_id.
    const archived = await createTask('Vencida archivada', yesterday, false)
    const live = await createTask('Vencida vigente', yesterday, false)
    const archivedId = archived.body.data.id as string
    const liveId = live.body.data.id as string

    await request(app.server).delete(`/api/tasks/${archivedId}`).set(auth()).expect(200)
    await runReminderScan()

    const taskDue = (entityId: string) =>
      db
        .select({ id: notification.id })
        .from(notification)
        .where(and(eq(notification.type, 'task_due'), eq(notification.entityId, entityId)))
    expect(await taskDue(archivedId)).toHaveLength(0)
    expect((await taskDue(liveId)).length).toBeGreaterThan(0)
    // El scan recorre todos los portales de la base de test, no solo el de esta suite.
  }, 60_000)

  it('DELETE de una tarea de otro portal → 404 y la tarea queda intacta', async () => {
    const [other] = await db.insert(portal).values({ name: `Otro Portal Tareas ${randomUUID()}` }).returning()
    const [foreign] = await db.insert(task).values({ portalId: other!.id, title: 'Tarea ajena' }).returning()

    const res = await request(app.server).delete(`/api/tasks/${foreign!.id}`).set(auth())
    expect(res.status).toBe(404)

    const [row] = await db.select().from(task).where(eq(task.id, foreign!.id))
    expect(row?.archived).toBe(false)
  })
})
