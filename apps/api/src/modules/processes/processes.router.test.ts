/**
 * processes.router.test.ts — Plantillas de proceso (SOPs) y sus tareas.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { portal, processTemplate } from '../../db/schema'
import { ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let foreignProcessId: string

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (url: string, body: unknown) => request(app.server).post(url).set(auth()).send(body as object)
const newSlug = () => `p-${randomUUID().slice(0, 8)}`

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  token = await loginToken(app, ctx.email, ctx.password)
  const [other] = await db.insert(portal).values({ name: `Otro Portal Procesos ${randomUUID()}` }).returning()
  const [fp] = await db.insert(processTemplate).values({ portalId: other!.id, slug: 'ajeno', name: 'Ajeno' }).returning()
  foreignProcessId = fp!.id
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('procesos', () => {
  it('crea, lista con taskCount y devuelve el detalle con tareas ordenadas', async () => {
    const created = await post('/api/processes', { slug: newSlug(), name: 'Mi proceso' })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = created.body.data.id as string

    for (const title of ['Uno', 'Dos', 'Tres']) {
      const t = await post(`/api/processes/${id}/tasks`, { title, steps: [{ text: 's', done: true }] })
      expect(t.status).toBe(201)
      // En la plantilla done se guarda siempre en false.
      expect(t.body.data.steps).toEqual([{ text: 's', done: false }])
    }

    const list = await request(app.server).get('/api/processes?limit=100').set(auth())
    expect((list.body.data as { id: string; taskCount: number }[]).find((p) => p.id === id)?.taskCount).toBe(3)

    const detail = await request(app.server).get(`/api/processes/${id}`).set(auth())
    expect(detail.body.data.tasks.map((t: { title: string }) => t.title)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('creaciones simultáneas con el mismo slug: una gana (201), el resto 409 (nunca 500)', async () => {
    const slug = newSlug()
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => post('/api/processes', { slug, name: `Carrera ${i}` })),
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(3)
  })

  it('rechaza slug duplicado (409) e inválido (400)', async () => {
    const slug = newSlug()
    expect((await post('/api/processes', { slug, name: 'A' })).status).toBe(201)
    expect((await post('/api/processes', { slug, name: 'B' })).status).toBe(409)
    expect((await post('/api/processes', { slug: 'Slug Malo', name: 'C' })).status).toBe(400)
  })

  it('reordena tareas y rechaza ids ajenos', async () => {
    const id = (await post('/api/processes', { slug: newSlug(), name: 'Orden' })).body.data.id as string
    const ids: string[] = []
    for (const title of ['A', 'B', 'C']) ids.push((await post(`/api/processes/${id}/tasks`, { title })).body.data.id)

    const res = await post(`/api/processes/${id}/tasks/reorder`, { orderedIds: [ids[2], ids[0], ids[1]] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(['C', 'A', 'B'])

    const bad = await post(`/api/processes/${id}/tasks/reorder`, { orderedIds: [ids[0], randomUUID()] })
    expect(bad.status).toBe(400)
  })

  it('actualiza y borra tareas de la plantilla', async () => {
    const id = (await post('/api/processes', { slug: newSlug(), name: 'Edit' })).body.data.id as string
    const taskId = (await post(`/api/processes/${id}/tasks`, { title: 'Vieja' })).body.data.id as string

    const upd = await request(app.server).patch(`/api/processes/${id}/tasks/${taskId}`).set(auth()).send({ title: 'Nueva' })
    expect(upd.status).toBe(200)
    expect(upd.body.data.title).toBe('Nueva')

    const del = await request(app.server).delete(`/api/processes/${id}/tasks/${taskId}`).set(auth())
    expect(del.status).toBe(200)
    const again = await request(app.server).delete(`/api/processes/${id}/tasks/${taskId}`).set(auth())
    expect(again.status).toBe(404)
  })

  it('archivar oculta el proceso del listado y del detalle', async () => {
    const id = (await post('/api/processes', { slug: newSlug(), name: 'Archivable' })).body.data.id as string
    expect((await request(app.server).delete(`/api/processes/${id}`).set(auth())).status).toBe(200)
    const list = await request(app.server).get('/api/processes?limit=100').set(auth())
    expect((list.body.data as { id: string }[]).some((p) => p.id === id)).toBe(false)
    expect((await request(app.server).get(`/api/processes/${id}`).set(auth())).status).toBe(404)
  })

  it('aislamiento por portal: un proceso ajeno es 404 para todas las rutas', async () => {
    expect((await request(app.server).get(`/api/processes/${foreignProcessId}`).set(auth())).status).toBe(404)
    expect((await request(app.server).patch(`/api/processes/${foreignProcessId}`).set(auth()).send({ name: 'x' })).status).toBe(404)
    expect((await post(`/api/processes/${foreignProcessId}/tasks`, { title: 'x' })).status).toBe(404)
    expect((await request(app.server).delete(`/api/processes/${foreignProcessId}`).set(auth())).status).toBe(404)
    const [row] = await db.select().from(processTemplate).where(eq(processTemplate.id, foreignProcessId))
    expect(row!.archived).toBe(false)
  })
})
