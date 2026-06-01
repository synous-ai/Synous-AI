import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { getPortal, updatePortal, UpdatePortalSchema } from './settings.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Configuración'
const security = ADMIN_SECURITY

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/portal',
    { schema: { tags: [TAG], summary: 'Datos del portal', security } },
    async (request) => ok(await getPortal(request.hubUser!.portalId)),
  )

  r.patch(
    '/portal',
    { schema: { tags: [TAG], summary: 'Actualizar portal', description: 'Nombre, zona horaria y moneda. Solo owner.', security, body: UpdatePortalSchema }, preHandler: [authorize('owner')] },
    async (request) => ok(await updatePortal(request.hubUser!.portalId, request.body)),
  )
}
