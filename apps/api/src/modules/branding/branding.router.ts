import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import { UpdateBrandingSchema, ClientUpdateBrandingSchema, SlugParamSchema } from './branding.schema'
import {
  getBrandingBySlug,
  listClientBranding,
  updateClientBranding,
  getOwnBranding,
  updateOwnBranding,
} from './branding.service'

const TAG = 'White-Label'

/** Público — el portal lo consulta antes del login para brandear por slug. */
export async function brandingPublicRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get(
    '/:slug',
    {
      schema: {
        tags: [TAG],
        summary: 'Branding por slug (público)',
        description: 'Devuelve nombre, logo y colores de la marca asociada al slug. Para tematizar el portal antes de autenticar.',
        params: SlugParamSchema,
      },
    },
    async (request) => ok(await getBrandingBySlug(request.params.slug)),
  )
}

/** Admin — configurar el branding white-label de cada cliente. */
export async function brandingAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/clients',
    { schema: { tags: [TAG], summary: 'Listar branding por cliente', security: ADMIN_SECURITY } },
    async (request) => ok(await listClientBranding(request.hubUser!.portalId)),
  )

  r.patch(
    '/clients/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar branding de un cliente',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
        body: UpdateBrandingSchema,
      },
    },
    async (request) =>
      ok(await updateClientBranding(request.hubUser!.portalId, request.params.id, request.body)),
  )
}

/** Cliente — autogestión de su brand kit desde el portal (token de cliente). */
export async function brandingClientRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get(
    '/',
    { schema: { tags: ['Client Portal'], summary: 'Mi marca', security: [{ bearerAuth: [] }] } },
    async (request) => ok(await getOwnBranding(request.clientAccount!.sub)),
  )

  r.patch(
    '/',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Guardar mi marca (logo, nombre, colores)',
        security: [{ bearerAuth: [] }],
        body: ClientUpdateBrandingSchema,
      },
    },
    async (request) => ok(await updateOwnBranding(request.clientAccount!.sub, request.body)),
  )
}
