import { and, count, desc, eq, isNull } from 'drizzle-orm'
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

export async function listNotifications(portalId: string, userId: string): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notification)
    .where(and(eq(notification.portalId, portalId), eq(notification.userId, userId)))
    .orderBy(desc(notification.createdAt))
    .limit(50)
}

export async function unreadCount(portalId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notification)
    .where(and(eq(notification.portalId, portalId), eq(notification.userId, userId), isNull(notification.readAt)))
  return row?.n ?? 0
}

export async function markRead(portalId: string, userId: string, id: string): Promise<void> {
  const res = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.portalId, portalId), eq(notification.userId, userId), eq(notification.id, id)))
    .returning({ id: notification.id })
  if (res.length === 0) throw Errors.notFound('Notificación no encontrada')
}

export async function markAllRead(portalId: string, userId: string): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.portalId, portalId), eq(notification.userId, userId), isNull(notification.readAt)))
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
