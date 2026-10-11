import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateProjectSchema,
  ListProjectsQuerySchema,
  MoveTaskSchema,
  UpdateProjectSchema,
} from './projects.schema'
import {
  archiveProject,
  createProject,
  duplicateProject,
  getProject,
  listProjects,
  listProjectTasks,
  moveProjectTask,
  updateProject,
} from './projects.service'

const TAG = 'Proyectos'
const security = ADMIN_SECURITY
const canWrite = authorize('owner', 'member', 'collaborator')

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar proyectos',
        description:
          'Proyectos internos del portal con miembros, conteo de tareas, empresa y deal. Filtros: status, companyId, memberId, includeArchived.',
        security,
        querystring: ListProjectsQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listProjects(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    {
      schema: { tags: [TAG], summary: 'Detalle de proyecto', security, params: IdParamSchema },
    },
    async (request) => ok(await getProject(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear proyecto',
        description:
          'Crea el proyecto y sus miembros. Si `kind` es el slug de un proceso, copia las tareas del proceso al proyecto (todo en una transacción).',
        security,
        body: CreateProjectSchema,
      },
      preHandler: [canWrite],
    },
    async (request, reply) => {
      const created = await createProject(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar proyecto',
        description: 'Actualización parcial. Si viene `memberIds` reemplaza los miembros. Registra record_history.',
        security,
        params: IdParamSchema,
        body: UpdateProjectSchema,
      },
      preHandler: [canWrite],
    },
    async (request) =>
      ok(await updateProject(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )

  r.post(
    '/:id/duplicate',
    {
      schema: {
        tags: [TAG],
        summary: 'Duplicar proyecto',
        description:
          'Copia el proyecto como "<nombre> (copia)": sin fechas, status not_started, tareas en pending con checklist reiniciada y los mismos miembros.',
        security,
        params: IdParamSchema,
      },
      preHandler: [canWrite],
    },
    async (request, reply) => {
      const copy = await duplicateProject(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return reply.status(201).send(ok(copy))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar proyecto',
        description: 'Soft delete: archived = true. Deja de aparecer en listados.',
        security,
        params: IdParamSchema,
      },
      preHandler: [canWrite],
    },
    async (request) => {
      await archiveProject(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )

  r.get(
    '/:id/tasks',
    {
      schema: {
        tags: [TAG],
        summary: 'Tareas del proyecto',
        description: 'Tareas activas ordenadas por status y posición, con sus responsables.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await listProjectTasks(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/:id/tasks/move',
    {
      schema: {
        tags: [TAG],
        summary: 'Mover / reordenar tarea en el kanban',
        description:
          'Setea el status de `taskId` y reescribe la posición de cada id de `orderedIds` según su índice. Devuelve las tareas del proyecto.',
        security,
        params: IdParamSchema,
        body: MoveTaskSchema,
      },
      preHandler: [canWrite],
    },
    async (request) => ok(await moveProjectTask(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )
}
