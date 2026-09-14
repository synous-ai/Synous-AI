/**
 * Bus de notificaciones: fallback en proceso y fan-out por Redis pub/sub.
 * Redis se mockea: los tests nunca necesitan un Redis real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from '../config/env'
import {
  emitNotification,
  subscribeNotifications,
  closeNotificationBus,
  notificationChannel,
  countNotificationSubscriptions,
  type NotificationEvent,
} from './notification-bus'

const redis = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void
  class FakeRedis {
    static instances: FakeRedis[] = []
    handlers = new Map<string, Handler[]>()
    publish = vi.fn(async (_channel: string, _message: string) => 1)
    subscribe = vi.fn(async (_channel: string) => 1)
    unsubscribe = vi.fn(async (_channel: string) => 0)
    quit = vi.fn(async () => 'OK')
    disconnect = vi.fn()
    constructor(
      public url: string,
      public options: Record<string, unknown>,
    ) {
      FakeRedis.instances.push(this)
    }
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
      return this
    }
    emit(event: string, ...args: unknown[]): void {
      for (const h of this.handlers.get(event) ?? []) h(...args)
    }
  }
  return { FakeRedis }
})

vi.mock('ioredis', () => ({ Redis: redis.FakeRedis, default: redis.FakeRedis }))

const PORTAL_A = 'portal-a'
const PORTAL_B = 'portal-b'

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    portalId: PORTAL_A,
    userId: null,
    type: 'deal_stale',
    title: 'Deal sin actividad',
    entityType: 'deal',
    entityId: 'deal-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const originalRedisUrl = env.REDIS_URL

beforeEach(() => {
  redis.FakeRedis.instances = []
})

afterEach(async () => {
  await closeNotificationBus()
  env.REDIS_URL = originalRedisUrl
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sin REDIS_URL (fallback en proceso)', () => {
  beforeEach(() => {
    env.REDIS_URL = undefined
  })

  it('entrega a los listeners del mismo portal y usuario, sin tocar Redis', async () => {
    const u1 = vi.fn()
    const u2 = vi.fn()
    const otherPortal = vi.fn()
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, u1)
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u2' }, u2)
    subscribeNotifications({ portalId: PORTAL_B, userId: 'u1' }, otherPortal)

    await emitNotification(event({ userId: null }))
    await emitNotification(event({ userId: 'u1' }))

    expect(u1).toHaveBeenCalledTimes(2)
    expect(u2).toHaveBeenCalledTimes(1) // solo el broadcast
    expect(otherPortal).not.toHaveBeenCalled()
    expect(redis.FakeRedis.instances).toHaveLength(0)
  })

  it('desuscribir deja de entregar y es idempotente', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, listener)
    unsubscribe()
    unsubscribe()
    await emitNotification(event())
    expect(listener).not.toHaveBeenCalled()
    expect(countNotificationSubscriptions(PORTAL_A)).toBe(0)
  })

  it('un listener que lanza no impide la entrega a los demás', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn()
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, () => {
      throw new Error('boom')
    })
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u2' }, ok)
    await expect(emitNotification(event())).resolves.toBeUndefined()
    expect(ok).toHaveBeenCalledTimes(1)
  })
})

describe('con REDIS_URL (pub/sub)', () => {
  beforeEach(() => {
    env.REDIS_URL = 'redis://redis.test:6379'
  })

  const byOptions = (role: string) =>
    redis.FakeRedis.instances.filter((c) => c.options.connectionName === `synous:notifications:${role}`)

  it('publica en el canal del portal y NO entrega en proceso (llega por el subscriber)', async () => {
    const listener = vi.fn()
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, listener)
    const e = event()
    await emitNotification(e)
    await emitNotification(event({ portalId: PORTAL_B }))

    const [publisher] = byOptions('publisher')
    expect(byOptions('publisher')).toHaveLength(1) // una sola conexión reutilizada
    expect(publisher!.publish).toHaveBeenNthCalledWith(1, notificationChannel(PORTAL_A), JSON.stringify(e))
    expect(publisher!.publish).toHaveBeenNthCalledWith(2, 'notifications:portal-b', expect.any(String))
    expect(listener).not.toHaveBeenCalled()
  })

  it('una conexión subscriber por instancia; canal por portal con el primer socket, libre con el último', () => {
    const offA1 = subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, vi.fn())
    const offA2 = subscribeNotifications({ portalId: PORTAL_A, userId: 'u2' }, vi.fn())
    const offB = subscribeNotifications({ portalId: PORTAL_B, userId: 'u9' }, vi.fn())

    expect(byOptions('subscriber')).toHaveLength(1)
    const [sub] = byOptions('subscriber')
    expect(sub!.subscribe.mock.calls).toEqual([['notifications:portal-a'], ['notifications:portal-b']])

    offA1()
    expect(sub!.unsubscribe).not.toHaveBeenCalled()
    offA2()
    expect(sub!.unsubscribe).toHaveBeenCalledWith('notifications:portal-a')
    offB()
    expect(sub!.unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('el subscriber entrega solo a sockets del portal del canal y del usuario destinatario', () => {
    const a1 = vi.fn()
    const a2 = vi.fn()
    const b1 = vi.fn()
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u1' }, a1)
    subscribeNotifications({ portalId: PORTAL_A, userId: 'u2' }, a2)
    subscribeNotifications({ portalId: PORTAL_B, userId: 'u1' }, b1)
    const [sub] = byOptions('subscriber')

    const toU1 = event({ userId: 'u1' })
    sub!.emit('message', notificationChannel(PORTAL_A), JSON.stringify(toU1))
    sub!.emit('message', notificationChannel(PORTAL_A), JSON.stringify(event({ userId: null })))

    expect(a1).toHaveBeenCalledTimes(2)
    expect(a1).toHaveBeenNthCalledWith(1, toU1)
    expect(a2).toHaveBeenCalledTimes(1)
    expect(b1).not.toHaveBeenCalled()
  })

  it('descarta mensajes cuyo portal no coincide con el canal o que no son eventos válidos', () => {
    const b1 = vi.fn()
    subscribeNotifications({ portalId: PORTAL_B, userId: 'u1' }, b1)
    const [sub] = byOptions('subscriber')

    sub!.emit('message', notificationChannel(PORTAL_B), JSON.stringify(event({ portalId: PORTAL_A })))
    sub!.emit('message', notificationChannel(PORTAL_B), 'no-es-json')
    sub!.emit('message', notificationChannel(PORTAL_B), JSON.stringify({ portalId: PORTAL_B }))

    expect(b1).not.toHaveBeenCalled()
  })

  it('un publish que falla no lanza', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    await emitNotification(event()) // crea el publisher
    const [publisher] = byOptions('publisher')
    publisher!.publish.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(emitNotification(event())).resolves.toBeUndefined()
    expect(errorLog).toHaveBeenCalledWith(
      '[notification-bus] no se pudo publicar la notificación:',
      'ECONNREFUSED',
    )
  })

  it('un publish colgado se abandona por timeout sin lanzar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await emitNotification(event())
    const [publisher] = byOptions('publisher')
    publisher!.publish.mockImplementationOnce(() => new Promise<number>(() => {}))

    vi.useFakeTimers()
    const pending = emitNotification(event())
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toBeUndefined()
  })
})
