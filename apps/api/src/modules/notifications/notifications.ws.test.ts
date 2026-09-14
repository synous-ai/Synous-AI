/**
 * WebSocket de notificaciones: auth por primer mensaje, cierre 1008 ante auth
 * ausente/inválida/vencida, heartbeat, limpieza de listeners y aislamiento
 * entre portales y usuarios. Corre sin Redis (bus en proceso).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket, { type ClientOptions } from 'ws'
import type { AddressInfo } from 'node:net'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { env } from '../../config/env'
import { ensurePortalAndUser, type TestContext } from '../../test/helpers'
import { emitNotification, countNotificationSubscriptions, type NotificationEvent } from '../../lib/notification-bus'
import { notificationsWsRoutes, type NotificationsWsOptions } from './notifications.ws'

interface Client {
  ws: WebSocket
  messages: Array<Record<string, unknown>>
  closed: Promise<{ code: number; reason: string }>
  opened: Promise<void>
}

function connect(baseUrl: string, options?: ClientOptions): Client {
  const ws = new WebSocket(`${baseUrl}/ws/notifications`, options)
  const messages: Array<Record<string, unknown>> = []
  ws.on('message', (data) => messages.push(JSON.parse(data.toString()) as Record<string, unknown>))
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
  })
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  return { ws, messages, closed, opened }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timeout esperando la condición')
    await new Promise((r) => setTimeout(r, 10))
  }
}

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as AddressInfo
  return `ws://127.0.0.1:${port}`
}

function event(overrides: Partial<NotificationEvent>): NotificationEvent {
  return {
    portalId: 'otro-portal',
    userId: null,
    type: 'deal_stale',
    title: 'x',
    entityType: null,
    entityId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const app = buildApp()
let baseUrl: string
let ctx: TestContext
const originalRedisUrl = env.REDIS_URL

beforeAll(async () => {
  env.REDIS_URL = undefined
  baseUrl = await listen(app)
  ctx = await ensurePortalAndUser()
})

afterAll(async () => {
  env.REDIS_URL = originalRedisUrl
  await app.close()
  await closeDb()
})

/** App mínima con plazos cortos, para no esperar 5 s / 25 s reales. */
async function withShortTimers(opts: NotificationsWsOptions, fn: (url: string) => Promise<void>): Promise<void> {
  const small = Fastify()
  await small.register(fastifyWebsocket)
  await small.register(notificationsWsRoutes, opts)
  try {
    await fn(await listen(small))
  } finally {
    await small.close()
  }
}

describe('/ws/notifications', () => {
  it('autentica con el primer mensaje y entrega solo lo del portal y usuario propios', async () => {
    const c = connect(baseUrl)
    await c.opened
    c.ws.send(JSON.stringify({ type: 'auth', token: `faketoken:${ctx.clerkUserId}` }))
    await waitFor(() => c.messages.some((m) => m.type === 'connected'))

    await emitNotification(event({ portalId: 'otro-portal', title: 'otro portal' }))
    await emitNotification(event({ portalId: ctx.portalId, userId: 'otro-usuario', title: 'otro usuario' }))
    await emitNotification(event({ portalId: ctx.portalId, userId: ctx.userId, title: 'para mí' }))
    await emitNotification(event({ portalId: ctx.portalId, userId: null, title: 'broadcast' }))

    await waitFor(() => c.messages.some((m) => m.title === 'broadcast'))
    const titles = c.messages.filter((m) => m.type !== 'connected').map((m) => m.title)
    expect(titles).toEqual(['para mí', 'broadcast'])

    c.ws.close()
    await c.closed
    await waitFor(() => countNotificationSubscriptions(ctx.portalId) === 0)
  })

  it('token inválido → cierra con 1008', async () => {
    const c = connect(baseUrl)
    await c.opened
    c.ws.send(JSON.stringify({ type: 'auth', token: 'no-es-un-token-de-clerk' }))
    expect((await c.closed).code).toBe(1008)
    expect(c.messages).toEqual([])
  })

  it('primer mensaje que no es de auth → cierra con 1008', async () => {
    const c = connect(baseUrl)
    await c.opened
    c.ws.send('hola')
    expect((await c.closed).code).toBe(1008)
  })

  it('el token por query string ya no autentica', async () => {
    await withShortTimers({ authTimeoutMs: 150 }, async (url) => {
      const ws = new WebSocket(`${url}/ws/notifications?token=faketoken:${ctx.clerkUserId}`)
      const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)))
      expect(code).toBe(1008)
    })
  })

  it('sin mensaje de auth dentro del plazo → cierra con 1008', async () => {
    await withShortTimers({ authTimeoutMs: 150 }, async (url) => {
      const c = connect(url)
      await c.opened
      const started = Date.now()
      expect((await c.closed).code).toBe(1008)
      expect(Date.now() - started).toBeGreaterThanOrEqual(100)
    })
  })

  it('heartbeat: un socket que no contesta pings se descarta y libera su suscripción', async () => {
    await withShortTimers({ heartbeatIntervalMs: 50 }, async (url) => {
      const c = connect(url, { autoPong: false })
      await c.opened
      c.ws.send(JSON.stringify({ type: 'auth', token: `faketoken:${ctx.clerkUserId}` }))
      await waitFor(() => c.messages.some((m) => m.type === 'connected'))
      expect(countNotificationSubscriptions(ctx.portalId)).toBe(1)

      await c.closed // terminate() del server → 1006 del lado del cliente
      await waitFor(() => countNotificationSubscriptions(ctx.portalId) === 0)
    })
  })

  it('un socket que contesta pings sigue abierto', async () => {
    await withShortTimers({ heartbeatIntervalMs: 50 }, async (url) => {
      const c = connect(url)
      await c.opened
      c.ws.send(JSON.stringify({ type: 'auth', token: `faketoken:${ctx.clerkUserId}` }))
      await waitFor(() => c.messages.some((m) => m.type === 'connected'))
      await new Promise((r) => setTimeout(r, 300))
      expect(c.ws.readyState).toBe(WebSocket.OPEN)
      c.ws.close()
      await c.closed
    })
  })
})
