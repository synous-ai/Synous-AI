import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { ListQuerySchema, IdParamSchema } from '../../lib/crm-schemas'
import { listClients, getClientDetail, listClientAccounts } from './clients.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Clientes'
const security = ADMIN_SECURITY

export async function clientsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar clientes',
        description: 'Contactos en etapa customer (paginado por cursor).',
        security,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listClients(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de cliente',
        description: 'Contacto + deals asociados + historial de cambios. Alimenta el User Detail.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      return ok(await getClientDetail(request.hubUser!.portalId, request.params.id))
    },
  )

  // ── Portal de clientes — admin view ─────────────────────────────────────────

  r.get(
    '/accounts',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar cuentas del portal de clientes',
        description:
          'Lista todas las client_account del portal con su estado de invitación y los deal IDs a los que tienen acceso. No expone password_hash ni invite_token.',
        security,
      },
    },
    async (request) => {
      const accounts = await listClientAccounts(request.hubUser!.portalId)
      return ok(accounts)
    },
  )
}
