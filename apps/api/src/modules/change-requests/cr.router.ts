import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateCRSchema, UpdateCRSchema, AddItemSchema, CRListQuerySchema, TransitionSchema, CommentSchema } from './cr.schema'
import { listCRs, getCRDetail, createCR, updateCR, addItem, deleteItem, transitionCR, addComment } from './cr.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Change Requests'
const security = ADMIN_SECURITY
const mut = { preHandler: [authorize('owner', 'member')] }
const ItemParam = z.object({ id: z.string().min(1), itemId: z.string().min(1) })

export async function crRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get('/', { schema: { tags: [TAG], summary: 'Listar change requests', security, querystring: CRListQuerySchema } }, async (req) =>
    ok(await listCRs(req.hubUser!.portalId, req.query.dealId)),
  )
  r.get('/:id', { schema: { tags: [TAG], summary: 'Detalle de CR (items, comentarios, historial)', security, params: IdParamSchema } }, async (req) =>
    ok(await getCRDetail(req.hubUser!.portalId, req.params.id)),
  )
  r.post('/', { schema: { tags: [TAG], summary: 'Crear CR (borrador, number auto por deal)', security, body: CreateCRSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await createCR(req.hubUser!.portalId, req.hubUser!.sub, req.body))),
  )
  r.patch('/:id', { schema: { tags: [TAG], summary: 'Editar CR (solo borrador)', security, params: IdParamSchema, body: UpdateCRSchema }, ...mut }, async (req) =>
    ok(await updateCR(req.hubUser!.portalId, req.params.id, req.body)),
  )
  r.post('/:id/items', { schema: { tags: [TAG], summary: 'Agregar ítem', security, params: IdParamSchema, body: AddItemSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await addItem(req.hubUser!.portalId, req.params.id, req.body))),
  )
  r.delete('/:id/items/:itemId', { schema: { tags: [TAG], summary: 'Quitar ítem', security, params: ItemParam }, ...mut }, async (req) => {
    await deleteItem(req.hubUser!.portalId, req.params.id, req.params.itemId)
    return ok({ success: true })
  })
  r.post('/:id/transition', { schema: { tags: [TAG], summary: 'Cambiar estado (send/approve/reject/…)', security, params: IdParamSchema, body: TransitionSchema }, ...mut }, async (req) =>
    ok(await transitionCR(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body.status, req.body.comment)),
  )
  r.post('/:id/comments', { schema: { tags: [TAG], summary: 'Comentar', security, params: IdParamSchema, body: CommentSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await addComment(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body.body))),
  )
}
