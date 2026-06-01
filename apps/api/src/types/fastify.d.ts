import type { AccessTokenPayload } from '../lib/jwt'

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario admin autenticado (seteado por el middleware `authenticate`). */
    hubUser?: AccessTokenPayload
  }
}
