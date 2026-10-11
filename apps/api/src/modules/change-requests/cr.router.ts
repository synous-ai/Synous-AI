import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  AddItemSchema,
  AttachmentsSchema,
  CommentSchema,
  CRListQuerySchema,
  CRSummaryQuerySchema,
  CreateCRSchema,
  CreateProposalSchema,
  ProposalParamSchema,
  TransitionSchema,
  UpdateCRSchema,
  UpdateProposalSchema,
} from './cr.schema'
import {
  addAttachments,
  addComment,
  addItem,
  createCR,
  deleteItem,
  getCRDetail,
  listCRs,
  summarizeCRs,
  transitionCR,
  updateCR,
} from './cr.service'
import { createProposal, listProposals, sendProposal, updateProposal } from './cr-proposals.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Change Requests'
const security = ADMIN_SECURITY
// collaborator puede gestionar change requests (crear, editar, comentar)
const mut = { preHandler: [authorize('owner', 'member', 'collaborator')] }
const ItemParam = z.object({ id: z.string().min(1), itemId: z.string().min(1) })

export async function crRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get('/', { schema: { tags: [TAG], summary: 'Listar change requests', description: 'Listado paginado por cursor. `status` acepta CSV o repetido; `bucket` agrupa por quién tiene la pelota.', security, querystring: CRListQuerySchema } }, async (req) => {
    const { items, nextCursor } = await listCRs(req.hubUser!.portalId, req.query)
    return ok(items, { nextCursor })
  })
  r.get('/summary', { schema: { tags: [TAG], summary: 'Contadores por bucket', security, querystring: CRSummaryQuerySchema } }, async (req) =>
    ok(await summarizeCRs(req.hubUser!.portalId, req.query)),
  )
  r.get('/:id', { schema: { tags: [TAG], summary: 'Detalle de CR (ítems, propuestas, comentarios, eventos, adjuntos, vínculos)', security, params: IdParamSchema } }, async (req) =>
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

  r.get('/:id/proposals', { schema: { tags: [TAG], summary: 'Propuestas de la CR (todas las versiones)', security, params: IdParamSchema } }, async (req) =>
    ok(await listProposals(req.hubUser!.portalId, req.params.id)),
  )
  r.post('/:id/proposals', { schema: { tags: [TAG], summary: 'Crear versión de propuesta (y enviarla por defecto)', security, params: IdParamSchema, body: CreateProposalSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await createProposal(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body))),
  )
  r.patch('/:id/proposals/:proposalId', { schema: { tags: [TAG], summary: 'Editar propuesta (solo borrador)', security, params: ProposalParamSchema, body: UpdateProposalSchema }, ...mut }, async (req) =>
    ok(await updateProposal(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.params.proposalId, req.body)),
  )
  r.post('/:id/proposals/:proposalId/send', { schema: { tags: [TAG], summary: 'Enviar una propuesta guardada como borrador', description: 'Misma lógica que crear con `send: true`: jubila la anterior, denormaliza en la CR y la deja en `sent`.', security, params: ProposalParamSchema }, ...mut }, async (req) =>
    ok(await sendProposal(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.params.proposalId)),
  )

  r.post('/:id/transition', { schema: { tags: [TAG], summary: 'Cambiar estado (send/approve/reject/…)', security, params: IdParamSchema, body: TransitionSchema }, ...mut }, async (req) =>
    ok(await transitionCR(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body.status, req.body.comment)),
  )
  r.post('/:id/comments', { schema: { tags: [TAG], summary: 'Comentar (con adjuntos opcionales)', security, params: IdParamSchema, body: CommentSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await addComment(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body))),
  )
  r.post('/:id/attachments', { schema: { tags: [TAG], summary: 'Adjuntar archivos ya subidos', security, params: IdParamSchema, body: AttachmentsSchema }, ...mut }, async (req, reply) =>
    reply.status(201).send(ok(await addAttachments(req.hubUser!.portalId, req.hubUser!.sub, req.params.id, req.body))),
  )
}
