import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { FocusQuerySchema } from './focus.schema'
import { getFocus } from './focus.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Seguimientos'
const security = ADMIN_SECURITY

export async function focusRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Seguimientos + deals que necesitan atención',
        description:
          'Devuelve las tareas abiertas bucketizadas (vencidas / hoy / próximos 7 días) y los deals abiertos sin próxima acción o sin actividad reciente (>14 días). ' +
          'Usa ?mine=true para filtrar follow-ups al usuario autenticado.',
        security,
        querystring: FocusQuerySchema,
      },
    },
    async (request) => {
      const userId = request.query.mine ? request.hubUser!.sub : undefined
      return ok(await getFocus(request.hubUser!.portalId, userId))
    },
  )
}
