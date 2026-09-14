import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { ADMIN_SECURITY } from '../../lib/http'
import { IdParamSchema, ListQuerySchema } from '../../lib/crm-schemas'
import { BrandIdentitySchema } from './onboarding.schema'
import { BrandFileUploadSchema } from '../branding/branding.schema'
import {
  listOnboardings,
  getOnboardingByDeal,
  addDealBrandFile,
  archiveDealBrandFile,
  updateDealBrandIdentity,
} from './onboarding.service'

const TAG = 'Onboarding'

const DealIdParamSchema = z.object({ dealId: z.string().min(1) })
const DealAssetParamSchema = z.object({ dealId: z.string().min(1), assetId: z.string().min(1) })

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
        description: 'Progreso del onboarding post-venta de cada deal. Orden: in_progress primero, luego por actualización más reciente. Paginado por cursor.',
        security: ADMIN_SECURITY,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listOnboardings(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
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

  r.post(
    '/deals/:dealId/brand-files',
    {
      schema: {
        tags: [TAG],
        summary: 'Agregar un archivo de marca al deal',
        description: 'Mismo propósito de subida que el flujo del cliente (onboarding_material). 409 si el deal no tiene una cuenta de cliente asociada. No notifica (lo origina el propio equipo).',
        security: ADMIN_SECURITY,
        params: DealIdParamSchema,
        body: BrandFileUploadSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const asset = await addDealBrandFile(request.hubUser!.portalId, request.hubUser!.sub, request.params.dealId, request.body.storageKey)
      return reply.status(201).send(ok(asset))
    },
  )

  r.delete(
    '/deals/:dealId/brand-files/:assetId',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar un archivo de marca del deal',
        description: 'Soft delete (archived = true). 404 si el archivo no existe o no pertenece a ese deal/portal.',
        security: ADMIN_SECURITY,
        params: DealAssetParamSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => {
      await archiveDealBrandFile(request.hubUser!.portalId, request.hubUser!.sub, request.params.dealId, request.params.assetId)
      return ok({ success: true })
    },
  )

  r.patch(
    '/deals/:dealId/brand-identity',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar la identidad de marca del deal (brief, q11)',
        description: 'Mismas reglas que la edición del cliente, auditada con el hub_user que la hizo. No notifica.',
        security: ADMIN_SECURITY,
        params: DealIdParamSchema,
        body: BrandIdentitySchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) =>
      ok(await updateDealBrandIdentity(request.hubUser!.portalId, request.hubUser!.sub, request.params.dealId, request.body.brandIdentity)),
  )
}
