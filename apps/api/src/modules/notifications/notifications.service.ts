import { and, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db'
import { notification, hubUser } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { emitNotification } from '../../lib/notification-bus'

type NotificationRow = typeof notification.$inferSelect

export interface CreateNotificationInput {
  portalId: string
  userId?: string | null
  clientId?: string | null
  entityType?: string | null
  entityId?: string | null
  type: string
  title: string
  body?: string | null
  actionUrl?: string | null
}

/** Inserta la notificación y la emite por el bus (para el WS). */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const [row] = await db
    .insert(notification)
    .values({
      portalId: input.portalId,
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      actionUrl: input.actionUrl ?? null,
    })
    .returning()
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

/**
 * Destinatario de una consulta de notificaciones. El llamador NO elige un id
 * arbitrario: los routers lo construyen desde el token ya verificado, así que
 * nadie puede leer la bandeja de otro cambiando un parámetro.
 */
export type Recipient = { kind: 'user'; id: string } | { kind: 'client'; id: string }

/** Condición de pertenencia. Única definición de "esta notificación es tuya". */
function ownedBy(portalId: string, to: Recipient): SQL | undefined {
  return and(
    eq(notification.portalId, portalId),
    to.kind === 'user' ? eq(notification.userId, to.id) : eq(notification.clientId, to.id),
  )
}

export interface ListNotificationsResult {
  items: NotificationRow[]
  /** Cursor para la página siguiente; `null` si no hay más. */
  nextCursor: string | null
}

/**
 * Listado paginado por CURSOR (no offset): con offset, una notificación nueva
 * durante el scroll corre todas las filas y el usuario ve repetidos o se saltea
 * elementos.
 *
 * El cursor es `<createdAt ISO>|<id>`: `created_at` solo no alcanza porque dos
 * notificaciones del mismo evento (p. ej. notifyAdmins sobre varios admins)
 * comparten timestamp al milisegundo y una de ellas se perdería. El `id`
 * desempata. El índice (recipient, created_at, id) sostiene exactamente este
 * orden.
 */
export async function listNotifications(
  portalId: string,
  to: Recipient,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<ListNotificationsResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)

  let cursorCond: SQL | undefined
  if (opts.cursor) {
    const sep = opts.cursor.lastIndexOf('|')
    const at = new Date(opts.cursor.slice(0, sep))
    const id = opts.cursor.slice(sep + 1)
    if (!Number.isNaN(at.getTime()) && id) {
      cursorCond = sql`(${notification.createdAt}, ${notification.id}) < (${at}, ${id})`
    }
  }

  // Se pide uno de más para saber si hay página siguiente sin un count aparte.
  const rows = await db
    .select()
    .from(notification)
    .where(and(ownedBy(portalId, to), cursorCond))
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  return {
    items,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  }
}

export async function unreadCount(portalId: string, to: Recipient): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notification)
    .where(and(ownedBy(portalId, to), isNull(notification.readAt)))
  return row?.n ?? 0
}

/**
 * Marca UNA notificación como leída.
 *
 * El WHERE lleva la condición de pertenencia junto al id: una notificación de
 * otro destinatario no matchea y devuelve 404 — no 403. Un 403 confirmaría que
 * el id existe, que es justo lo que no queremos filtrar (IDOR por enumeración).
 * Idempotente: re-marcar algo ya leído no falla.
 */
export async function markRead(portalId: string, to: Recipient, id: string): Promise<void> {
  const res = await db
    .update(notification)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(ownedBy(portalId, to), eq(notification.id, id)))
    .returning({ id: notification.id })
  if (res.length === 0) throw Errors.notFound('Notificación no encontrada')
}

export async function markAllRead(portalId: string, to: Recipient): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(ownedBy(portalId, to), isNull(notification.readAt)))
}

/**
 * Nombre para mostrar del hub_user que ejecutó una acción.
 * Se usa para componer mensajes tipo "Carlos convirtió «X» en lead".
 * Devuelve 'Alguien' como fallback si no se encuentra (nunca rompe la notificación).
 */
export async function actorName(portalId: string, userId: string): Promise<string> {
  const [u] = await db
    .select({ firstName: hubUser.firstName, lastName: hubUser.lastName, email: hubUser.email })
    .from(hubUser)
    .where(and(eq(hubUser.id, userId), eq(hubUser.portalId, portalId)))
    .limit(1)
  if (!u) return 'Alguien'
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return name || u.email || 'Alguien'
}

/** Payload de una notificación dirigida a los admins (sin userId — se completa por admin). */
type NotifyAdminsPayload = Omit<CreateNotificationInput, 'portalId' | 'userId' | 'clientId'>

/**
 * Crea una notificación para TODOS los admins (hub_user) activos del portal,
 * opcionalmente excluyendo a quien originó la acción (`exceptUserId`) para no
 * auto-notificarse. Una fila de notification por admin (userId seteado).
 */
export async function notifyAdmins(
  portalId: string,
  payload: NotifyAdminsPayload,
  opts?: { exceptUserId?: string },
): Promise<void> {
  const admins = await db
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.isActive, true)))

  for (const a of admins) {
    if (opts?.exceptUserId && a.id === opts.exceptUserId) continue
    await createNotification({ portalId, userId: a.id, ...payload })
  }
}
