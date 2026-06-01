import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { UpsertPrefSchema } from './notification-prefs.schema'
import { listPrefs, upsertPref } from './notification-prefs.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Notificaciones'
const security = ADMIN_SECURITY

export async function notificationPrefsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar preferencias de notificación',
        description:
          'Devuelve las preferencias del usuario autenticado para todos los eventTypes conocidos. Si no hay filas guardadas se devuelven los defaults sin persistirlos.',
        security,
      },
    },
    async (request) => {
      const prefs = await listPrefs(request.hubUser!.portalId, request.hubUser!.sub)
      return ok(prefs)
    },
  )

  r.patch(
    '/:eventType',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar preferencia de notificación',
        description: 'Upsert de una preferencia (inApp / email) para el eventType indicado.',
        security,
        body: UpsertPrefSchema.omit({ eventType: true }),
      },
    },
    async (request) => {
      const { eventType } = request.params as { eventType: string }
      const row = await upsertPref(request.hubUser!.portalId, request.hubUser!.sub, {
        eventType,
        ...request.body,
      })
      return ok(row)
    },
  )
}
