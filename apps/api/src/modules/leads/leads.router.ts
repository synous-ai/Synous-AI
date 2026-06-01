import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { ListQuerySchema, IdParamSchema } from '../../lib/crm-schemas'
import { listLeads, getLeadDetail } from './leads.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Leads'
const security = ADMIN_SECURITY

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar leads',
        description: 'Contactos en etapa lead/mql/sql/opportunity (paginado por cursor).',
        security,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listLeads(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de lead',
        description: 'Contacto + deals asociados + historial de cambios. Alimenta el User Detail.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      return ok(await getLeadDetail(request.hubUser!.portalId, request.params.id))
    },
  )
}
