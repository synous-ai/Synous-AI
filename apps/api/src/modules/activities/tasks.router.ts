import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateTaskSchema, UpdateTaskSchema, TaskQuerySchema } from './activities.schema'
import { createTask, listTasks, updateTask, deleteTask } from './activities.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Tareas'
const security = ADMIN_SECURITY

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar tareas',
        description: 'Tareas filtrables por estado, responsable, contacto o deal.',
        security,
        querystring: TaskQuerySchema,
      },
    },
    async (request) => ok(await listTasks(request.hubUser!.portalId, request.query)),
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear tarea',
        description: 'Crea una tarea con responsable, vencimiento y asociaciones opcionales.',
        security,
        body: CreateTaskSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createTask(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar tarea',
        description: 'Actualiza una tarea. Al pasar a completed se setea completed_at automáticamente.',
        security,
        params: IdParamSchema,
        body: UpdateTaskSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => ok(await updateTask(request.hubUser!.portalId, request.params.id, request.body)),
  )

  r.delete(
    '/:id',
    {
      schema: { tags: [TAG], summary: 'Eliminar tarea', description: 'Borra una tarea.', security, params: IdParamSchema },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await deleteTask(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
