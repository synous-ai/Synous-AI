import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateDeliverableSchema, UpdateDeliverableSchema, DeliverableListQuerySchema } from './deliverables.schema'
import { listDeliverables, createDeliverable, updateDeliverable, deleteDeliverable } from './deliverables.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Entregables'
const security = ADMIN_SECURITY

export async function deliverablesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar entregables',
        description: 'Lista todos los entregables del portal. Filtrá por dealId para obtener los de un deal específico.',
        security,
        querystring: DeliverableListQuerySchema,
      },
    },
    async (request) => {
      const items = await listDeliverables(request.hubUser!.portalId, request.query)
      return ok(items)
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear entregable',
        description: 'Crea un entregable asociado a un deal. Requiere rol owner o member.',
        security,
        body: CreateDeliverableSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createDeliverable(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar entregable',
        description: 'Actualiza campos del entregable. Si el status pasa a approved o changes_requested, se registra reviewedAt automáticamente. Requiere rol owner o member.',
        security,
        params: IdParamSchema,
        body: UpdateDeliverableSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await updateDeliverable(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar entregable',
        description: 'Elimina el entregable permanentemente. Requiere rol owner.',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      await deleteDeliverable(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
