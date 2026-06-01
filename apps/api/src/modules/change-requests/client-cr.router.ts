import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CommentSchema, ClientDecisionSchema } from './cr.schema'
import { clientListCRs, clientDecision, clientComment } from './cr.service'
import { CLIENT_SECURITY } from '../../lib/http'

const TAG = 'Client Portal'
const security = CLIENT_SECURITY

export async function clientCrRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get('/', { schema: { tags: [TAG], summary: 'Change requests del cliente', security } }, async (req) =>
    ok(await clientListCRs(req.clientAccount!.sub)),
  )
  r.post('/:id/approve', { schema: { tags: [TAG], summary: 'Aprobar CR', security, params: IdParamSchema, body: ClientDecisionSchema } }, async (req) => {
    await clientDecision(req.clientAccount!.sub, req.params.id, 'approved', req.body.comment)
    return ok({ success: true })
  })
  r.post('/:id/reject', { schema: { tags: [TAG], summary: 'Rechazar CR', security, params: IdParamSchema, body: ClientDecisionSchema } }, async (req) => {
    await clientDecision(req.clientAccount!.sub, req.params.id, 'rejected', req.body.comment)
    return ok({ success: true })
  })
  r.post('/:id/comments', { schema: { tags: [TAG], summary: 'Comentar CR', security, params: IdParamSchema, body: CommentSchema } }, async (req, reply) =>
    reply.status(201).send(ok(await clientComment(req.clientAccount!.sub, req.params.id, req.body.body))),
  )
}
