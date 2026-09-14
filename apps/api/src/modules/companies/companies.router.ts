import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { ListQuerySchema, IdParamSchema } from '../../lib/crm-schemas'
import { CreateCompanySchema, UpdateCompanySchema } from './companies.schema'
import { listCompanies, getCompany, getCompanyDetail, createCompany, updateCompany, archiveCompany } from './companies.service'
import { ADMIN_SECURITY } from '../../lib/http'
import { ClientUpdateBrandingSchema } from '../branding/branding.schema'
import { updateCompanyBranding } from '../branding/branding.service'

const TAG = 'Empresas'
const security = ADMIN_SECURITY

export async function companiesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar empresas', description: 'Listado paginado por cursor (no archivadas).', security, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listCompanies(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    { schema: { tags: [TAG], summary: 'Obtener empresa', description: 'Devuelve una empresa por id.', security, params: IdParamSchema } },
    async (request) => {
      return ok(await getCompany(request.hubUser!.portalId, request.params.id))
    },
  )

  r.get(
    '/:id/detail',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle completo de la empresa',
        description: 'Empresa + contactos + deals + notas + tareas + historial. Alimenta el Company Detail.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getCompanyDetail(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear empresa', description: 'Crea una empresa. Requiere rol owner o member.', security, body: CreateCompanySchema }, preHandler: [authorize('owner', 'member', 'collaborator')] },
    async (request, reply) => {
      const created = await createCompany(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    { schema: { tags: [TAG], summary: 'Actualizar empresa', description: 'Actualiza campos y registra cambios en record_history. Requiere owner o member.', security, params: IdParamSchema, body: UpdateCompanySchema }, preHandler: [authorize('owner', 'member', 'collaborator')] },
    async (request) => {
      return ok(await updateCompany(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    { schema: { tags: [TAG], summary: 'Archivar empresa', description: 'Soft delete (archived = true). Requiere rol owner.', security, params: IdParamSchema }, preHandler: [authorize('owner')] },
    async (request) => {
      await archiveCompany(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )

  r.patch(
    '/:id/branding',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar branding de la empresa (portal de cliente)',
        description: 'Nombre de marca, logo y colores que ve el cliente en su portal. Mismos campos que PATCH /api/client/branding, editados por el equipo. No notifica (solo audita) — el cambio lo origina el propio equipo.',
        security,
        params: IdParamSchema,
        body: ClientUpdateBrandingSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) =>
      ok(await updateCompanyBranding(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )
}
