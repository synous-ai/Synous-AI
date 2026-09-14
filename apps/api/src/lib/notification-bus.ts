import { Redis } from 'ioredis'
import { z } from 'zod'
import { env } from '../config/env'

/** Evento de notificación que se empuja por WebSocket. */
export interface NotificationEvent {
  portalId: string
  userId: string | null
  type: string
  title: string
  entityType: string | null
  entityId: string | null
  createdAt: string
}

/** A quién se le entrega: un hub_user dentro de su portal. */
export interface NotificationTarget {
  portalId: string
  userId: string
}

export type NotificationListener = (event: NotificationEvent) => void

/**
 * Bus de notificaciones en tiempo real.
 *
 * En Vercel cada socket queda fijado a UNA instancia de la Function, y la
 * request que crea la notificación casi nunca cae en la misma instancia que
 * sostiene el socket del destinatario. Por eso, con `REDIS_URL`, el evento
 * viaja por Redis pub/sub (un canal por portal) y cada instancia lo reparte a
 * SUS sockets. Sin `REDIS_URL` (dev local, tests) se reparte en el proceso.
 *
 * Por instancia hay como mucho UNA conexión publisher y UNA subscriber,
 * creadas perezosamente: la subscriber solo existe si la instancia llegó a
 * sostener un socket.
 */

/** Cuánto se espera un PUBLISH antes de darlo por perdido. */
const PUBLISH_TIMEOUT_MS = 2_000

export function notificationChannel(portalId: string): string {
  return `notifications:${portalId}`
}

const NotificationEventSchema = z.object({
  portalId: z.string(),
  userId: z.string().nullable(),
  type: z.string(),
  title: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
})

interface Subscription {
  target: NotificationTarget
  listener: NotificationListener
}

const subscriptionsByPortal = new Map<string, Set<Subscription>>()

let publisher: Redis | null = null
let subscriber: Redis | null = null

function createRedisClient(role: 'publisher' | 'subscriber', url: string): Redis {
  const client = new Redis(url, {
    connectionName: `synous:notifications:${role}`,
    // El publisher falla rápido: el evento es best-effort (la fila ya está en
    // la DB y el REST es la fuente de verdad), no vale la pena retener la request.
    ...(role === 'publisher' ? { maxRetriesPerRequest: 1 } : {}),
  })
  // Sin listener de 'error', ioredis lo reporta como evento no manejado en
  // cada reintento de conexión.
  client.on('error', (err: Error) => {
    console.error(`[notification-bus] error de Redis (${role}):`, err.message)
  })
  return client
}

function getSubscriber(url: string): Redis {
  if (!subscriber) {
    subscriber = createRedisClient('subscriber', url)
    subscriber.on('message', (channel: string, message: string) => {
      const event = parseEvent(message)
      // El portal del payload tiene que coincidir con el canal: un mensaje mal
      // publicado jamás debe cruzar de tenant.
      if (!event || notificationChannel(event.portalId) !== channel) return
      dispatch(event)
    })
  }
  return subscriber
}

function parseEvent(message: string): NotificationEvent | null {
  try {
    const parsed = NotificationEventSchema.safeParse(JSON.parse(message))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Entrega a los suscriptores locales del portal cuyo usuario coincide (userId null = todo el portal). */
function dispatch(event: NotificationEvent): void {
  const subscriptions = subscriptionsByPortal.get(event.portalId)
  if (!subscriptions) return
  for (const { target, listener } of subscriptions) {
    if (event.userId !== null && event.userId !== target.userId) continue
    try {
      listener(event)
    } catch (err) {
      console.error('[notification-bus] un listener falló:', (err as Error)?.message ?? err)
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Emite un evento. NUNCA rechaza: un Redis caído no puede romper la operación
 * que creó la notificación.
 */
export async function emitNotification(event: NotificationEvent): Promise<void> {
  const url = env.REDIS_URL
  if (!url) {
    dispatch(event)
    return
  }
  try {
    publisher ??= createRedisClient('publisher', url)
    await withTimeout(
      publisher.publish(notificationChannel(event.portalId), JSON.stringify(event)),
      PUBLISH_TIMEOUT_MS,
    )
  } catch (err) {
    console.error('[notification-bus] no se pudo publicar la notificación:', (err as Error)?.message ?? err)
  }
}

/**
 * Suscribe un destinatario. Devuelve la función para desuscribirlo
 * (idempotente). El canal del portal se suscribe con el primer socket de ese
 * portal en la instancia y se libera con el último.
 */
export function subscribeNotifications(target: NotificationTarget, listener: NotificationListener): () => void {
  const subscription: Subscription = { target, listener }
  const channel = notificationChannel(target.portalId)
  const url = env.REDIS_URL

  let subscriptions = subscriptionsByPortal.get(target.portalId)
  if (!subscriptions) {
    subscriptions = new Set()
    subscriptionsByPortal.set(target.portalId, subscriptions)
    if (url) {
      getSubscriber(url)
        .subscribe(channel)
        .catch((err: Error) => console.error(`[notification-bus] no se pudo suscribir a ${channel}:`, err.message))
    }
  }
  subscriptions.add(subscription)

  let active = true
  return () => {
    if (!active) return
    active = false
    const current = subscriptionsByPortal.get(target.portalId)
    if (!current) return
    current.delete(subscription)
    if (current.size > 0) return
    subscriptionsByPortal.delete(target.portalId)
    if (url && subscriber) {
      subscriber
        .unsubscribe(channel)
        .catch((err: Error) => console.error(`[notification-bus] no se pudo desuscribir de ${channel}:`, err.message))
    }
  }
}

/** Suscripciones vivas de un portal en esta instancia (diagnóstico y tests). */
export function countNotificationSubscriptions(portalId: string): number {
  return subscriptionsByPortal.get(portalId)?.size ?? 0
}

/** Cierra las conexiones a Redis y descarta las suscripciones (shutdown local y tests). */
export async function closeNotificationBus(): Promise<void> {
  const clients = [publisher, subscriber].filter((c): c is Redis => c !== null)
  publisher = null
  subscriber = null
  subscriptionsByPortal.clear()
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.quit()
      } catch {
        client.disconnect()
      }
    }),
  )
}
