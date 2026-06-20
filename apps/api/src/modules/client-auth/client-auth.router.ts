import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { getClientAccount } from './client-auth.service'

export async function clientAuthRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // ─── GET /me ─────────────────────────────────────────────────────────────────
  r.get(
    '/me',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Cliente autenticado actual',
        description:
          'Devuelve los datos públicos del clientAccount resuelto desde la sesión de Clerk. ' +
          'Requiere header Authorization: Bearer <clerk_session_token>.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authenticateClient],
    },
    async (request) => {
      const client = await getClientAccount(request.clientAccount!.sub)
      return ok(client)
    },
  )
}
