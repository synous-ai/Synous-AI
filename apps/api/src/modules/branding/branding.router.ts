import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema, ListQuerySchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY, CLIENT_SECURITY } from '../../lib/http'
import { UpdateBrandingSchema, ClientUpdateBrandingSchema, SlugParamSchema, BrandFileUploadSchema } from './branding.schema'
import {
  getBrandingBySlug,
  listClientBranding,
  updateClientBranding,
  getOwnBranding,
  updateOwnBranding,
  addOwnBrandFile,
  deleteOwnBrandFile,
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
    { schema: { tags: [TAG], summary: 'Listar branding por cliente', description: 'Listado paginado por cursor (orden por email).', security: ADMIN_SECURITY, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listClientBranding(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
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
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) =>
      ok(await updateClientBranding(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
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

  r.post(
    '/files',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Agregar un archivo de marca',
        description: 'Vincula un archivo YA subido (propósito onboarding_material) al deal activo del cliente como material de marca. El logo NO se sube acá — es el campo de identidad (ver PATCH /).',
        security: CLIENT_SECURITY,
        body: BrandFileUploadSchema,
      },
    },
    async (request, reply) => {
      const asset = await addOwnBrandFile(request.clientAccount!.sub, request.body.storageKey)
      return reply.status(201).send(ok(asset))
    },
  )

  r.delete(
    '/files/:id',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Eliminar un archivo de marca',
        description: 'Soft delete (archived = true). 404 si el archivo no existe, no es un archivo de marca propio, o ya estaba archivado.',
        security: CLIENT_SECURITY,
        params: IdParamSchema,
      },
    },
    async (request) => {
      await deleteOwnBrandFile(request.clientAccount!.sub, request.params.id)
      return ok({ success: true })
    },
  )
}
