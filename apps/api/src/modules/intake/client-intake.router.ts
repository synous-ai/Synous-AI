import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import { RespondIntakeSchema } from './intake.schema'
import { clientIntakes, respondIntake } from './intake.service'
import { CLIENT_SECURITY } from '../../lib/http'

const TAG = 'Client Portal'
const security = CLIENT_SECURITY

export async function clientIntakeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Formularios de intake del cliente', description: 'Intakes de los deals del cliente, con campos y respuesta si existe.', security } },
    async (request) => ok(await clientIntakes(request.clientAccount!.sub)),
  )

  r.post(
    '/:id/respond',
    { schema: { tags: [TAG], summary: 'Responder un intake', security, params: IdParamSchema, body: RespondIntakeSchema } },
    async (request) => {
      await respondIntake(request.clientAccount!.sub, request.params.id, request.body.answers)
      return ok({ success: true })
    },
  )
}
