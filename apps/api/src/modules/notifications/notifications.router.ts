import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { IdParamSchema } from '../../lib/crm-schemas'
import { listNotifications, unreadCount, markRead, markAllRead } from './notifications.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Notificaciones'
const security = ADMIN_SECURITY

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar notificaciones del usuario', security } },
    async (request) => ok(await listNotifications(request.hubUser!.portalId, request.hubUser!.sub)),
  )
  r.get(
    '/unread-count',
    { schema: { tags: [TAG], summary: 'Cantidad de no leídas', security } },
    async (request) => ok({ count: await unreadCount(request.hubUser!.portalId, request.hubUser!.sub) }),
  )
  r.post(
    '/:id/read',
    { schema: { tags: [TAG], summary: 'Marcar como leída', security, params: IdParamSchema } },
    async (request) => {
      await markRead(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )
  r.post(
    '/read-all',
    { schema: { tags: [TAG], summary: 'Marcar todas como leídas', security } },
    async (request) => {
      await markAllRead(request.hubUser!.portalId, request.hubUser!.sub)
      return ok({ success: true })
    },
  )
}
