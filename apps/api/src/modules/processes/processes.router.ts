import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateProcessSchema,
  CreateProcessTaskSchema,
  ListProcessesQuerySchema,
  ProcessTaskParamsSchema,
  ReorderProcessTasksSchema,
  UpdateProcessSchema,
  UpdateProcessTaskSchema,
} from './processes.schema'
import {
  archiveProcess,
  createProcess,
  createProcessTask,
  deleteProcessTask,
  getProcess,
  listProcesses,
  reorderProcessTasks,
  updateProcess,
  updateProcessTask,
} from './processes.service'

const TAG = 'Procesos'
const security = ADMIN_SECURITY
const canWrite = authorize('owner', 'member', 'collaborator')

export async function processesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar procesos',
        description: 'Plantillas (SOPs) con su cantidad de tareas.',
        security,
        querystring: ListProcessesQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listProcesses(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    { schema: { tags: [TAG], summary: 'Detalle de proceso con tareas ordenadas', security, params: IdParamSchema } },
    async (request) => ok(await getProcess(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear proceso', security, body: CreateProcessSchema }, preHandler: [canWrite] },
    async (request, reply) => {
      const created = await createProcess(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: { tags: [TAG], summary: 'Actualizar proceso', security, params: IdParamSchema, body: UpdateProcessSchema },
      preHandler: [canWrite],
    },
    async (request) =>
      ok(await updateProcess(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar proceso',
        description: 'Soft delete. Los proyectos ya creados conservan sus tareas (se copiaron).',
        security,
        params: IdParamSchema,
      },
      preHandler: [canWrite],
    },
    async (request) => {
      await archiveProcess(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )

  r.post(
    '/:id/tasks',
    {
      schema: { tags: [TAG], summary: 'Agregar tarea al proceso', security, params: IdParamSchema, body: CreateProcessTaskSchema },
      preHandler: [canWrite],
    },
    async (request, reply) => {
      const created = await createProcessTask(request.hubUser!.portalId, request.params.id, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.post(
    '/:id/tasks/reorder',
    {
      schema: {
        tags: [TAG],
        summary: 'Reordenar tareas del proceso',
        security,
        params: IdParamSchema,
        body: ReorderProcessTasksSchema,
      },
      preHandler: [canWrite],
    },
    async (request) => ok(await reorderProcessTasks(request.hubUser!.portalId, request.params.id, request.body)),
  )

  r.patch(
    '/:id/tasks/:taskId',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar tarea del proceso',
        security,
        params: ProcessTaskParamsSchema,
        body: UpdateProcessTaskSchema,
      },
      preHandler: [canWrite],
    },
    async (request) =>
      ok(await updateProcessTask(request.hubUser!.portalId, request.params.id, request.params.taskId, request.body)),
  )

  r.delete(
    '/:id/tasks/:taskId',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar tarea del proceso',
        description: 'Borrado en duro: es una plantilla, no un dato del CRM.',
        security,
        params: ProcessTaskParamsSchema,
      },
      preHandler: [canWrite],
    },
    async (request) => {
      await deleteProcessTask(request.hubUser!.portalId, request.params.id, request.params.taskId)
      return ok({ success: true })
    },
  )
}
