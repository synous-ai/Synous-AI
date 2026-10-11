import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { ADMIN_SECURITY } from '../../lib/http'
import { TeamUserParamSchema, UpdateTeamProfileSchema } from './team.schema'
import { getTeamMember, listTeam, updateTeamProfile } from './team.service'

const TAG = 'Equipo'
const security = ADMIN_SECURITY

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar el equipo con su carga de trabajo',
        description:
          'Usuarios activos del portal con su perfil (cargo, responsabilidades, estado) y conteos: proyectos activos y tareas abiertas / vencidas / en revisión / bloqueadas.',
        security,
      },
    },
    async (request) => ok(await listTeam(request.hubUser!.portalId)),
  )

  r.get(
    '/:userId',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de una persona del equipo',
        description: 'Perfil, carga de trabajo, proyectos activos y tareas abiertas.',
        security,
        params: TeamUserParamSchema,
      },
    },
    async (request) => ok(await getTeamMember(request.hubUser!.portalId, request.params.userId)),
  )

  r.patch(
    '/:userId/profile',
    {
      schema: {
        tags: [TAG],
        summary: 'Editar el perfil de equipo',
        description:
          'Upsert parcial. Un owner edita a cualquiera; cualquier otro usuario solo puede cambiar su propio workStatus.',
        security,
        params: TeamUserParamSchema,
        body: UpdateTeamProfileSchema,
      },
    },
    async (request) =>
      ok(
        await updateTeamProfile(
          request.hubUser!.portalId,
          { id: request.hubUser!.sub, role: request.hubUser!.role },
          request.params.userId,
          request.body,
        ),
      ),
  )
}
