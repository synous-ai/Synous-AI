import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { ADMIN_SECURITY } from '../../lib/http'
import { IdParamSchema } from '../../lib/crm-schemas'
import { listOnboardings, getOnboardingByDeal } from './onboarding.service'

const TAG = 'Onboarding'

/**
 * Rutas de ADMIN — progreso del onboarding POST-VENTA de cada deal (wizard de
 * 8 pasos que completa el cliente en el Client Portal). Requieren token de
 * hub_user.
 */
export async function onboardingAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar onboardings del portal',
        description: 'Progreso del onboarding post-venta de cada deal. Orden: in_progress primero, luego por actualización más reciente.',
        security: ADMIN_SECURITY,
      },
    },
    async (request) => ok(await listOnboardings(request.hubUser!.portalId)),
  )

  r.get(
    '/deals/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Onboarding completo de un deal',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getOnboardingByDeal(request.hubUser!.portalId, request.params.id)),
  )
}
