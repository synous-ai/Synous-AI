import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { z } from 'zod'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreatePipelineSchema, AddStageSchema, UpdateStageSchema } from './pipelines.schema'
import { listPipelines, getStages, createPipeline, addStage, deleteStage, updateStage } from './pipelines.service'
import { ADMIN_SECURITY } from '../../lib/http'

const StageParamSchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1),
})

const TAG = 'Pipelines'
const security = ADMIN_SECURITY

export async function pipelinesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar pipelines', description: 'Devuelve los pipelines del portal con sus etapas anidadas.', security } },
    async (request) => {
      return ok(await listPipelines(request.hubUser!.portalId))
    },
  )

  r.get(
    '/:id/stages',
    { schema: { tags: [TAG], summary: 'Etapas de un pipeline', description: 'Devuelve las etapas de un pipeline ordenadas.', security, params: IdParamSchema } },
    async (request) => {
      return ok(await getStages(request.hubUser!.portalId, request.params.id))
    },
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear pipeline', description: 'Crea un pipeline con sus etapas. Requiere rol owner.', security, body: CreatePipelineSchema }, preHandler: [authorize('owner')] },
    async (request, reply) => {
      const created = await createPipeline(request.hubUser!.portalId, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.post(
    '/:id/stages',
    { schema: { tags: [TAG], summary: 'Agregar etapa', description: 'Agrega una etapa al final del pipeline. Solo owner.', security, params: IdParamSchema, body: AddStageSchema }, preHandler: [authorize('owner')] },
    async (request, reply) => {
      const created = await addStage(request.hubUser!.portalId, request.params.id, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id/stages/:stageId',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar etapa',
        description: 'Actualiza campos de una etapa (label, probability, exitCriteria, description, etc.). Owner o member.',
        security,
        params: StageParamSchema,
        body: UpdateStageSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      const updated = await updateStage(request.hubUser!.portalId, request.params.id, request.params.stageId, request.body)
      return ok(updated)
    },
  )

  r.delete(
    '/:id/stages/:stageId',
    { schema: { tags: [TAG], summary: 'Eliminar etapa', description: 'Elimina una etapa (si no tiene deals). Solo owner.', security, params: StageParamSchema }, preHandler: [authorize('owner')] },
    async (request) => {
      await deleteStage(request.hubUser!.portalId, request.params.id, request.params.stageId)
      return ok({ success: true })
    },
  )
}
