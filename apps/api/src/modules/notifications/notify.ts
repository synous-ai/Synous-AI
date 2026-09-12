import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { notification, hubUser, clientDealAccess } from '../../db/schema'
import { emitNotification } from '../../lib/notification-bus'
import {
  NOTIFICATION_EVENTS,
  type NotificationEventType,
  type NotificationPayload,
} from './notification-events'

/**
 * Emisor de notificaciones. Es la ÚNICA puerta de entrada que usan los
 * services de negocio.
 *
 * Tres garantías, todas ausentes en el `createNotification` anterior:
 *
 * 1. NUNCA rompe la operación que la llama. Todo va dentro de un try/catch que
 *    loguea y sigue. Antes, ningún call site envolvía la llamada: un insert
 *    fallido devolvía 500 al usuario DESPUÉS de que el cambio de negocio ya
 *    había commiteado (deal movido de etapa, CR decidida), dejando la
 *    respuesta HTTP mintiendo sobre lo que pasó.
 *
 * 2. Idempotente cuando se le pasa `dedupeKey`: el índice único parcial
 *    absorbe el segundo intento con `onConflictDoNothing`. Un reintento de
 *    webhook, un doble click o dos jobs simultáneos no duplican.
 *
 * 3. El destinatario lo resuelve el BACKEND. La firma no acepta un
 *    `recipientId` arbitrario desde afuera: se pide el deal o el rol y acá se
 *    traduce a personas concretas.
 */

interface EmitOptions {
  /** Entidad de negocio a la que apunta la notificación (para agrupar/navegar). */
  entity?: { type: string; id: string } | null
  /**
   * Clave de idempotencia. Mismo evento + mismo destinatario ⇒ misma clave.
   * Sin clave, el evento siempre inserta (correcto para eventos repetibles
   * como comentarios).
   */
  dedupeKey?: string
  /** Datos extra para el front. No se usa para lógica de negocio. */
  metadata?: Record<string, unknown>
}

interface InsertArgs {
  portalId: string
  userId: string | null
  clientId: string | null
  type: NotificationEventType
  title: string
  body: string | null
  actionUrl: string | null
  priority: string
  entityType: string | null
  entityId: string | null
  dedupeKey: string | null
  metadata: Record<string, unknown>
}

/** Inserta una fila y la empuja al bus. Idempotente si viene `dedupeKey`. */
async function insertOne(args: InsertArgs): Promise<void> {
  const [row] = await db
    .insert(notification)
    .values(args)
    .onConflictDoNothing({
      target: [notification.portalId, notification.dedupeKey],
      // Predicado del índice PARCIAL: sin él, Postgres no puede identificar
      // `uq_notification_dedupe` como el índice del ON CONFLICT y falla con
      // "no unique or exclusion constraint matching the ON CONFLICT".
      where: sql`dedupe_key IS NOT NULL`,
    })
    .returning()

  // Sin fila = la absorbió el dedupe. No es error y no se emite al bus: el
  // destinatario ya fue notificado de este mismo evento.
  if (!row) return

  emitNotification({
    portalId: row.portalId,
    userId: row.userId,
    type: row.type,
    title: row.title,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date()).toISOString(),
  })
}

/** Traduce un evento del catálogo a los campos de la fila. */
function render<T extends NotificationEventType>(type: T, payload: NotificationPayload<T>) {
  const evt = NOTIFICATION_EVENTS[type] as {
    priority: string
    title: (p: unknown) => string
    body?: (p: unknown) => string
    actionUrl?: (p: unknown) => string
  }
  return {
    title: evt.title(payload),
    body: evt.body?.(payload) ?? null,
    actionUrl: evt.actionUrl?.(payload) ?? null,
    priority: evt.priority,
  }
}

/**
 * Envuelve la emisión para que jamás propague. Devuelve `true` si se emitió,
 * `false` si falló — el caller puede ignorarlo tranquilo.
 */
async function safely(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (err) {
    // Se loguea con el evento para poder rastrearlo, pero NO se re-lanza: la
    // operación de negocio ya ocurrió y no puede fallar por esto.
    console.error(`[notify] no se pudo emitir "${label}":`, (err as Error)?.message ?? err)
    return false
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Notifica a UN admin concreto (típicamente el owner del deal). */
export async function notifyUser<T extends NotificationEventType>(
  portalId: string,
  userId: string,
  type: T,
  payload: NotificationPayload<T>,
  opts: EmitOptions = {},
): Promise<boolean> {
  if (NOTIFICATION_EVENTS[type].audience !== 'admin') {
    console.error(`[notify] "${type}" no es un evento de admin; se descarta`)
    return false
  }
  return safely(type, async () => {
    await insertOne({
      portalId,
      userId,
      clientId: null,
      type,
      ...render(type, payload),
      entityType: opts.entity?.type ?? null,
      entityId: opts.entity?.id ?? null,
      dedupeKey: opts.dedupeKey ?? null,
      metadata: opts.metadata ?? {},
    })
  })
}

/**
 * Notifica a TODOS los admins activos del portal. `exceptUserId` evita
 * auto-notificar a quien originó la acción.
 *
 * La clave de dedupe se sufija por admin: si no, el primer admin insertaría y
 * el índice único bloquearía a los demás, dejando notificado a uno solo.
 */
export async function notifyAdmins<T extends NotificationEventType>(
  portalId: string,
  type: T,
  payload: NotificationPayload<T>,
  opts: EmitOptions & { exceptUserId?: string } = {},
): Promise<boolean> {
  if (NOTIFICATION_EVENTS[type].audience !== 'admin') {
    console.error(`[notify] "${type}" no es un evento de admin; se descarta`)
    return false
  }
  return safely(type, async () => {
    const admins = await db
      .select({ id: hubUser.id })
      .from(hubUser)
      .where(and(eq(hubUser.portalId, portalId), eq(hubUser.isActive, true)))

    const rendered = render(type, payload)
    for (const a of admins) {
      if (opts.exceptUserId && a.id === opts.exceptUserId) continue
      await insertOne({
        portalId,
        userId: a.id,
        clientId: null,
        type,
        ...rendered,
        entityType: opts.entity?.type ?? null,
        entityId: opts.entity?.id ?? null,
        dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${a.id}` : null,
        metadata: opts.metadata ?? {},
      })
    }
  })
}

/**
 * Notifica a los clientes con acceso a un deal.
 *
 * El destinatario se resuelve desde `client_deal_access` — NUNCA se recibe un
 * clientId de afuera. Así, aunque un caller pase un dealId equivocado, no
 * puede dirigir una notificación a un cliente arbitrario: solo llega a quien
 * ya tiene acceso a ese deal.
 */
export async function notifyDealClients<T extends NotificationEventType>(
  portalId: string,
  dealId: string,
  type: T,
  payload: NotificationPayload<T>,
  opts: EmitOptions = {},
): Promise<boolean> {
  if (NOTIFICATION_EVENTS[type].audience !== 'client') {
    console.error(`[notify] "${type}" no es un evento de cliente; se descarta`)
    return false
  }
  return safely(type, async () => {
    const clients = await db
      .select({ id: clientDealAccess.clientId })
      .from(clientDealAccess)
      .where(eq(clientDealAccess.dealId, dealId))

    const rendered = render(type, payload)
    for (const c of clients) {
      await insertOne({
        portalId,
        userId: null,
        clientId: c.id,
        type,
        ...rendered,
        entityType: opts.entity?.type ?? null,
        entityId: opts.entity?.id ?? null,
        dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${c.id}` : null,
        metadata: opts.metadata ?? {},
      })
    }
  })
}

/** Igual que notifyDealClients pero para varios deals a la vez. */
export async function notifyClientsOfDeals<T extends NotificationEventType>(
  portalId: string,
  dealIds: string[],
  type: T,
  payload: NotificationPayload<T>,
  opts: EmitOptions = {},
): Promise<boolean> {
  if (dealIds.length === 0) return false
  return safely(type, async () => {
    const clients = await db
      .selectDistinct({ id: clientDealAccess.clientId })
      .from(clientDealAccess)
      .where(inArray(clientDealAccess.dealId, dealIds))
    const rendered = render(type, payload)
    for (const c of clients) {
      await insertOne({
        portalId,
        userId: null,
        clientId: c.id,
        type,
        ...rendered,
        entityType: opts.entity?.type ?? null,
        entityId: opts.entity?.id ?? null,
        dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${c.id}` : null,
        metadata: opts.metadata ?? {},
      })
    }
  })
}
