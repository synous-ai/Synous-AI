import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateUserSchema, UpdateUserSchema } from './users.schema'
import { listUsers, createUser, updateUser } from './users.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Usuarios'
const security = ADMIN_SECURITY

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar usuarios del equipo', security } },
    async (request) => ok(await listUsers(request.hubUser!.portalId)),
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear usuario', description: 'Crea un hub_user. Solo owner.', security, body: CreateUserSchema }, preHandler: [authorize('owner')] },
    async (request, reply) => {
      const created = await createUser(request.hubUser!.portalId, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    { schema: { tags: [TAG], summary: 'Actualizar usuario', description: 'Rol, estado o nombre. Solo owner.', security, params: IdParamSchema, body: UpdateUserSchema }, preHandler: [authorize('owner')] },
    async (request) => ok(await updateUser(request.hubUser!.portalId, request.params.id, request.body)),
  )
}
