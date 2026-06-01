import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { ensurePortalAndUser } from '../../test/helpers'

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
  it('login con credenciales válidas devuelve accessToken', async () => {
    const res = await request(app.server).post('/api/auth/login').send({ email: ctx.email, password: ctx.password })
    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.user.email).toBe(ctx.email)
    expect(res.body.data.user.passwordHash).toBeUndefined()
  })

  it('login con password incorrecto devuelve 401', async () => {
    const res = await request(app.server).post('/api/auth/login').send({ email: ctx.email, password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('login con body inválido devuelve 400', async () => {
    const res = await request(app.server).post('/api/auth/login').send({ email: 'no-es-email' })
    expect(res.status).toBe(400)
  })

  it('/me sin token devuelve 401', async () => {
    const res = await request(app.server).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('/me con token devuelve el usuario', async () => {
    const login = await request(app.server).post('/api/auth/login').send({ email: ctx.email, password: ctx.password })
    const token = login.body.data.accessToken
    const res = await request(app.server).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe(ctx.email)
    expect(res.body.data.role).toBe('owner')
  })
})
