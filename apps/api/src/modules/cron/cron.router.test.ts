/**
 * GET /api/cron/reminders: solo Vercel Cron (Bearer CRON_SECRET) puede
 * disparar el scan de recordatorios.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { env } from '../../config/env'
import { listenForSupertest } from '../../test/helpers'

const runReminderScan = vi.hoisted(() => vi.fn(async () => ({ created: 3, bookingRemindersSent: 1 })))
vi.mock('../../jobs/reminders.service', () => ({ runReminderScan }))

const SECRET = 'cron-secret-de-test-0123456789abcdef'
const app = buildApp()
const originalSecret = env.CRON_SECRET
const originalNodeEnv = env.NODE_ENV

beforeAll(async () => {
  await listenForSupertest(app)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

beforeEach(() => {
  runReminderScan.mockClear()
  env.CRON_SECRET = SECRET
})

afterEach(() => {
  env.CRON_SECRET = originalSecret
  env.NODE_ENV = originalNodeEnv
})

describe('GET /api/cron/reminders', () => {
  it('sin Authorization → 401 sin body y sin correr el scan', async () => {
    const res = await request(app.server).get('/api/cron/reminders')
    expect(res.status).toBe(401)
    expect(res.text).toBe('')
    expect(runReminderScan).not.toHaveBeenCalled()
  })

  it.each([
    ['secreto equivocado', `Bearer ${SECRET.slice(0, -1)}x`],
    ['largo distinto', 'Bearer corto'],
    ['sin esquema Bearer', SECRET],
  ])('%s → 401', async (_label, header) => {
    const res = await request(app.server).get('/api/cron/reminders').set('Authorization', header)
    expect(res.status).toBe(401)
    expect(runReminderScan).not.toHaveBeenCalled()
  })

  it('Bearer válido → 200 con el resultado y el scan corre una vez', async () => {
    const res = await request(app.server).get('/api/cron/reminders').set('Authorization', `Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: { created: 3, bookingRemindersSent: 1 } })
    expect(runReminderScan).toHaveBeenCalledTimes(1)
  })

  it('CRON_SECRET sin configurar en producción → 503 y no corre nada', async () => {
    env.CRON_SECRET = undefined
    env.NODE_ENV = 'production'
    const res = await request(app.server).get('/api/cron/reminders').set('Authorization', 'Bearer ')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('CRON_NOT_CONFIGURED')
    expect(runReminderScan).not.toHaveBeenCalled()
  })
})
