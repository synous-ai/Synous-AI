import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { getCurrentUser } from './auth.service'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get(
    '/me',
    {
      schema: {
        tags: ['Autenticación'],
        summary: 'Usuario autenticado actual',
        description: 'Devuelve los datos del hub_user resuelto desde la sesión de Clerk.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    async (request) => {
      const user = await getCurrentUser(request.hubUser!.sub)
      return ok(user)
    },
  )
}
