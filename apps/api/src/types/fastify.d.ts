import type { HubUserContext } from '../middleware/clerk-auth'

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario admin autenticado (seteado por el middleware `authenticate`, resuelto desde Clerk). */
    hubUser?: HubUserContext
  }
}
