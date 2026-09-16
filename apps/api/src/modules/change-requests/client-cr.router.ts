import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  AttachmentsSchema,
  ClientAdjustmentSchema,
  ClientApproveSchema,
  ClientCancelSchema,
  ClientCommentSchema,
  ClientCreateCRSchema,
  ClientListQuerySchema,
  ClientRejectSchema,
} from './cr.schema'
import {
  clientAddAttachments,
  clientApprove,
  clientCancel,
  clientComment,
  clientCreateCR,
  clientGetCRDetail,
  clientListCRs,
  clientRequestAdjustment,
  clientReject,
  clientSummarizeCRs,
  type ClientCaller,
} from './client-cr.service'
import { CLIENT_SECURITY } from '../../lib/http'

const TAG = 'Client Portal'
const security = CLIENT_SECURITY

/**
 * Quién llama, SIEMPRE desde la sesión ya verificada por `authenticateClient`.
 * Ningún handler toma el clientId ni el portalId del body o del query.
 */
function caller(req: FastifyRequest): ClientCaller {
  return { clientId: req.clientAccount!.sub, portalId: req.clientAccount!.portalId }
}

export async function clientCrRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get('/', { schema: { tags: [TAG], summary: 'Change requests del cliente', description: 'Listado paginado por cursor. Nunca incluye borradores del equipo.', security, querystring: ClientListQuerySchema } }, async (req) => {
    const { items, nextCursor } = await clientListCRs(req.clientAccount!.sub, req.query)
    return ok(items, { nextCursor })
  })
  r.get('/summary', { schema: { tags: [TAG], summary: 'Contadores de solicitudes por bucket', security } }, async (req) =>
    ok(await clientSummarizeCRs(req.clientAccount!.sub)),
  )
  r.get('/:id', { schema: { tags: [TAG], summary: 'Detalle de una solicitud', security, params: IdParamSchema } }, async (req) =>
    ok(await clientGetCRDetail(req.clientAccount!.sub, req.params.id)),
  )
  r.post('/', { schema: { tags: [TAG], summary: 'Crear solicitud de cambio', security, body: ClientCreateCRSchema } }, async (req, reply) => {
    const { changeRequest, created } = await clientCreateCR(caller(req), req.body)
    // 200 y no 201 cuando el `clientRequestId` ya existía: no se creó nada
    // nuevo, es el mismo pedido reenviado.
    return reply.status(created ? 201 : 200).send(ok(changeRequest))
  })
  r.post('/:id/approve', { schema: { tags: [TAG], summary: 'Aprobar la propuesta vigente', security, params: IdParamSchema, body: ClientApproveSchema } }, async (req) => {
    await clientApprove(caller(req), req.params.id, req.body)
    return ok({ success: true })
  })
  r.post('/:id/reject', { schema: { tags: [TAG], summary: 'Rechazar la propuesta vigente', security, params: IdParamSchema, body: ClientRejectSchema } }, async (req) => {
    await clientReject(caller(req), req.params.id, req.body)
    return ok({ success: true })
  })
  r.post('/:id/request-adjustment', { schema: { tags: [TAG], summary: 'Pedir un ajuste sobre la propuesta', security, params: IdParamSchema, body: ClientAdjustmentSchema } }, async (req) => {
    await clientRequestAdjustment(caller(req), req.params.id, req.body)
    return ok({ success: true })
  })
  r.post('/:id/cancel', { schema: { tags: [TAG], summary: 'Cancelar una solicitud propia', security, params: IdParamSchema, body: ClientCancelSchema } }, async (req) => {
    await clientCancel(caller(req), req.params.id, req.body)
    return ok({ success: true })
  })
  r.post('/:id/comments', { schema: { tags: [TAG], summary: 'Comentar (con adjuntos opcionales)', security, params: IdParamSchema, body: ClientCommentSchema } }, async (req, reply) =>
    reply.status(201).send(ok(await clientComment(caller(req), req.params.id, req.body))),
  )
  r.post('/:id/attachments', { schema: { tags: [TAG], summary: 'Adjuntar archivos ya subidos', security, params: IdParamSchema, body: AttachmentsSchema } }, async (req, reply) =>
    reply.status(201).send(ok(await clientAddAttachments(caller(req), req.params.id, req.body.uploads))),
  )
}
