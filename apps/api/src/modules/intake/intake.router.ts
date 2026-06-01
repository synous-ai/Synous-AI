import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { CreateIntakeFormSchema, AssignIntakeSchema, DealIntakeQuerySchema } from './intake.schema'
import { listIntakeForms, createIntakeForm, listDealIntakes, assignIntake } from './intake.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Intake Forms'
const security = ADMIN_SECURITY

export async function intakeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/forms',
    { schema: { tags: [TAG], summary: 'Listar plantillas de intake', security } },
    async (request) => ok(await listIntakeForms(request.hubUser!.portalId)),
  )
  r.post(
    '/forms',
    { schema: { tags: [TAG], summary: 'Crear plantilla de intake', description: 'fields = [{name,label,type}]. Solo owner/member.', security, body: CreateIntakeFormSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await createIntakeForm(request.hubUser!.portalId, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.get(
    '/deal-intakes',
    { schema: { tags: [TAG], summary: 'Intakes asignados a un deal', security, querystring: DealIntakeQuerySchema } },
    async (request) => ok(await listDealIntakes(request.hubUser!.portalId, request.query.dealId)),
  )
  r.post(
    '/deal-intakes',
    { schema: { tags: [TAG], summary: 'Asignar formulario a un deal', security, body: AssignIntakeSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await assignIntake(request.hubUser!.portalId, request.body)
      return reply.status(201).send(ok(created))
    },
  )
}
