import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  CreateLibraryItemSchema,
  UpdateLibraryItemSchema,
  ListLibraryQuerySchema,
} from './library.schema'
import {
  listLibraryItems,
  createLibraryItem,
  updateLibraryItem,
  archiveLibraryItem,
} from './library.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Biblioteca'
const security = ADMIN_SECURITY

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar ítems de biblioteca',
        description: 'Lista todos los ítems del portal. Filtrá por type para obtener una categoría específica.',
        security,
        querystring: ListLibraryQuerySchema,
      },
    },
    async (request) => {
      const items = await listLibraryItems(request.hubUser!.portalId, request.query)
      return ok(items)
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear ítem de biblioteca',
        description: 'Crea un nuevo ítem de biblioteca. Requiere rol owner o member.',
        security,
        body: CreateLibraryItemSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createLibraryItem(
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
        summary: 'Actualizar ítem de biblioteca',
        description: 'Actualiza campos del ítem. Requiere rol owner o member.',
        security,
        params: IdParamSchema,
        body: UpdateLibraryItemSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await updateLibraryItem(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar ítem de biblioteca',
        description: 'Archiva el ítem (soft delete). Requiere rol owner o member.',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await archiveLibraryItem(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
