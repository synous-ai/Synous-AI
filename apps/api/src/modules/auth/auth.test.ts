import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

const app = buildApp()
let ctx: Awaited<ReturnType<typeof ensurePortalAndUser>>

beforeAll(async () => {
  await app.ready()
  ctx = await ensurePortalAndUser()
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('auth', () => {
  it('/me sin token devuelve 401', async () => {
    const res = await request(app.server).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('/me con token de Clerk inválido devuelve 401', async () => {
    const res = await request(app.server).get('/api/auth/me').set('Authorization', 'Bearer token-invalido')
    expect(res.status).toBe(401)
  })

  it('/me con token de Clerk válido devuelve el usuario', async () => {
    const token = await loginToken(app, ctx.email, ctx.password)
    const res = await request(app.server).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe(ctx.email)
    expect(res.body.data.role).toBe('owner')
    expect(res.body.data.passwordHash).toBeUndefined()
  })
})
