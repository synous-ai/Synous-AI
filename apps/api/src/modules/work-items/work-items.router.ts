import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ListWorkItemsQuerySchema,
} from './work-items.schema'
import {
  listWorkItems,
  createWorkItem,
  updateWorkItem,
  archiveWorkItem,
} from './work-items.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Operaciones'
const security = ADMIN_SECURITY

export async function workItemsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar ítems de operaciones',
        description: 'Lista todos los ítems del portal. Filtrá por type y/o status.',
        security,
        querystring: ListWorkItemsQuerySchema,
      },
    },
    async (request) => {
      const items = await listWorkItems(request.hubUser!.portalId, request.query)
      return ok(items)
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear ítem de operaciones',
        description: 'Crea un nuevo ítem de operaciones (bug, mejora, roadmap, proceso). Requiere rol owner o member.',
        security,
        body: CreateWorkItemSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createWorkItem(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar ítem de operaciones',
        description: 'Actualiza campos del ítem. Requiere rol owner o member.',
        security,
        params: IdParamSchema,
        body: UpdateWorkItemSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await updateWorkItem(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar ítem de operaciones',
        description: 'Archiva el ítem (soft delete). Requiere rol owner o member.',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await archiveWorkItem(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
