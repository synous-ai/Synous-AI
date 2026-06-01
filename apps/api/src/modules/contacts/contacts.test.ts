import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { recordHistory, auditLog } from '../../db/schema'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
const email = `c${Date.now()}@test.com`

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  token = await loginToken(app, ctx.email, ctx.password)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('contacts CRUD', () => {
  let contactId: string

  it('rechaza acceso sin token', async () => {
    const res = await request(app.server).get('/api/contacts')
    expect(res.status).toBe(401)
  })

  it('crea un contacto (201)', async () => {
    const res = await request(app.server)
      .post('/api/contacts')
      .set(auth())
      .send({ firstName: 'Ana', lastName: 'García', email })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeTruthy()
    expect(res.body.data.email).toBe(email)
    contactId = res.body.data.id
  })

  it('obtiene el contacto por id', async () => {
    const res = await request(app.server).get(`/api/contacts/${contactId}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data.firstName).toBe('Ana')
  })

  it('lista incluye el contacto creado', async () => {
    const res = await request(app.server).get('/api/contacts').set(auth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.some((c: { id: string }) => c.id === contactId)).toBe(true)
  })

  it('actualiza y registra el cambio en record_history + audit_log', async () => {
    const res = await request(app.server)
      .patch(`/api/contacts/${contactId}`)
      .set(auth())
      .send({ firstName: 'Ana María' })
    expect(res.status).toBe(200)
    expect(res.body.data.firstName).toBe('Ana María')

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'contact'), eq(recordHistory.entityId, contactId), eq(recordHistory.fieldName, 'firstName')))
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history.at(-1)!.newValue).toBe('Ana María')

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'contact'), eq(auditLog.entityId, contactId), eq(auditLog.action, 'UPDATE')))
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it('archiva (soft delete) y luego no es accesible ni aparece en la lista', async () => {
    const del = await request(app.server).delete(`/api/contacts/${contactId}`).set(auth())
    expect(del.status).toBe(200)

    const get = await request(app.server).get(`/api/contacts/${contactId}`).set(auth())
    expect(get.status).toBe(404)

    const list = await request(app.server).get('/api/contacts').set(auth())
    expect(list.body.data.some((c: { id: string }) => c.id === contactId)).toBe(false)
  })
})
