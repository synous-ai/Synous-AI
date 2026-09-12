import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import { listNotifications, unreadCount, markRead, markAllRead, type Recipient } from './notifications.service'
import { ADMIN_SECURITY, CLIENT_SECURITY } from '../../lib/http'

const TAG = 'Notificaciones'

/**
 * Query de paginación por cursor. El cursor es opaco para el cliente: se
 * devuelve en `meta.nextCursor` y se manda de vuelta tal cual.
 */
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).optional(),
})

/**
 * Rutas de notificaciones, montadas DOS veces con middlewares distintos:
 * `/api/notifications` (hub_user) y `/api/client/notifications`
 * (client_account).
 *
 * El destinatario NUNCA viene del request: lo construye `resolveRecipient` a
 * partir del token ya verificado. Por eso no hay forma de leer o marcar la
 * bandeja de otro manipulando un id — no existe ningún parámetro que lo
 * exprese.
 */
function buildNotificationRoutes(
  app: FastifyInstance,
  opts: {
    security: typeof ADMIN_SECURITY
    preHandler: typeof authenticate
    resolveRecipient: (request: { hubUser?: { sub: string; portalId: string }; clientAccount?: { sub: string; portalId: string } }) => {
      portalId: string
      to: Recipient
    }
  },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', opts.preHandler)
  const security = opts.security

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar notificaciones (paginado por cursor)',
        description: 'Devuelve `{ data, meta: { nextCursor } }`. Mandá `cursor` con el valor de `meta.nextCursor` para la página siguiente; `nextCursor: null` significa que no hay más.',
        security,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const { portalId, to } = opts.resolveRecipient(request)
      const { items, nextCursor } = await listNotifications(portalId, to, {
        limit: request.query.limit,
        cursor: request.query.cursor ?? null,
      })
      return { data: items, meta: { nextCursor } }
    },
  )

  r.get(
    '/unread-count',
    { schema: { tags: [TAG], summary: 'Cantidad de no leídas', security } },
    async (request) => {
      const { portalId, to } = opts.resolveRecipient(request)
      return ok({ count: await unreadCount(portalId, to) })
    },
  )

  r.post(
    '/:id/read',
    { schema: { tags: [TAG], summary: 'Marcar como leída', security, params: IdParamSchema } },
    async (request) => {
      const { portalId, to } = opts.resolveRecipient(request)
      await markRead(portalId, to, request.params.id)
      return ok({ success: true })
    },
  )

  r.post(
    '/read-all',
    { schema: { tags: [TAG], summary: 'Marcar todas como leídas', security } },
    async (request) => {
      const { portalId, to } = opts.resolveRecipient(request)
      await markAllRead(portalId, to)
      return ok({ success: true })
    },
  )
}

/** Bandeja del equipo interno (hub_user). */
export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  buildNotificationRoutes(app, {
    security: ADMIN_SECURITY,
    preHandler: authenticate,
    resolveRecipient: (request) => ({
      portalId: request.hubUser!.portalId,
      to: { kind: 'user', id: request.hubUser!.sub },
    }),
  })
}

/**
 * Bandeja del cliente del portal (client_account). No existía: la columna
 * `client_id` estaba en el schema desde el principio pero ningún endpoint la
 * consultaba, así que el cliente no podía ver ninguna notificación.
 */
export async function clientNotificationsRoutes(app: FastifyInstance): Promise<void> {
  buildNotificationRoutes(app, {
    security: CLIENT_SECURITY,
    preHandler: authenticateClient,
    resolveRecipient: (request) => ({
      portalId: request.clientAccount!.portalId,
      to: { kind: 'client', id: request.clientAccount!.sub },
    }),
  })
}
