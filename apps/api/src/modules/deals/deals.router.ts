import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { ListQuerySchema, IdParamSchema } from '../../lib/crm-schemas'
import { SearchBodySchema } from '../../lib/filter'
import { CreateDealSchema, UpdateDealSchema, ChangeStageSchema, AddDealContactSchema, DealContactParamSchema } from './deals.schema'
import {
  listDeals,
  getDeal,
  getDealDetail,
  searchDeals,
  createDeal,
  updateDeal,
  archiveDeal,
  changeStage,
  addDealContact,
  removeDealContact,
} from './deals.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Deals'
const security = ADMIN_SECURITY

export async function dealsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar deals', description: 'Listado paginado por cursor (no archivados).', security, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listDeals(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    { schema: { tags: [TAG], summary: 'Obtener deal', description: 'Devuelve un deal por id.', security, params: IdParamSchema } },
    async (request) => {
      return ok(await getDeal(request.hubUser!.portalId, request.params.id))
    },
  )

  r.get(
    '/:id/detail',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle completo del deal',
        description: 'Deal + empresa + contactos asociados + notas + tareas + historial. Alimenta la vista de deal.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getDealDetail(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/search',
    {
      schema: {
        tags: [TAG],
        summary: 'Búsqueda avanzada de deals',
        description:
          'Filtra deals con un filterBranch sobre campos permitidos (name, amount, currency, pipelineId, stageId, companyId, ownerId, closeDate, createdAt).',
        security,
        body: SearchBodySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await searchDeals(request.hubUser!.portalId, request.body)
      return ok(items, { nextCursor })
    },
  )

  r.post(
    '/:id/contacts',
    {
      schema: {
        tags: [TAG],
        summary: 'Asociar contacto al deal',
        description: 'Agrega un contacto al deal (join deal_contact). Idempotente.',
        security,
        params: IdParamSchema,
        body: AddDealContactSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await addDealContact(request.hubUser!.portalId, request.params.id, request.body.contactId, request.body.role)
      return ok({ success: true })
    },
  )

  r.delete(
    '/:id/contacts/:contactId',
    {
      schema: {
        tags: [TAG],
        summary: 'Quitar contacto del deal',
        description: 'Elimina la asociación contacto↔deal.',
        security,
        params: DealContactParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await removeDealContact(request.hubUser!.portalId, request.params.id, request.params.contactId)
      return ok({ success: true })
    },
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear deal', description: 'Crea un deal. Valida que el stage pertenezca al pipeline. Requiere owner o member.', security, body: CreateDealSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await createDeal(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    { schema: { tags: [TAG], summary: 'Actualizar deal', description: 'Actualiza campos del deal (no la etapa; usar /stage). Requiere owner o member.', security, params: IdParamSchema, body: UpdateDealSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => {
      return ok(await updateDeal(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body))
    },
  )

  r.patch(
    '/:id/stage',
    { schema: { tags: [TAG], summary: 'Cambiar etapa del deal', description: 'Mueve el deal de etapa. Registra STAGE_CHANGE en record_history + audit_log y crea una notificación. Requiere owner o member.', security, params: IdParamSchema, body: ChangeStageSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => {
      return ok(await changeStage(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body.stageId))
    },
  )

  r.delete(
    '/:id',
    { schema: { tags: [TAG], summary: 'Archivar deal', description: 'Soft delete (archived = true). Requiere rol owner.', security, params: IdParamSchema }, preHandler: [authorize('owner')] },
    async (request) => {
      await archiveDeal(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )
}
