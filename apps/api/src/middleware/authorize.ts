import type { FastifyRequest, FastifyReply } from 'fastify'
import { Errors } from '../lib/errors'

/**
 * Restringe una ruta a ciertos roles de hub_user.
 * Debe correr DESPUÉS de `authenticate` (lee `request.hubUser`).
 *
 *   'owner'  → puede todo
 *   'member' → no puede borrar/archivar
 *   'viewer' → sólo lectura
 */
export function authorize(...roles: string[]) {
  return async function authorizeHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = request.hubUser
    if (!user) throw Errors.unauthorized()
    if (roles.length > 0 && !roles.includes(user.role)) {
      throw Errors.forbidden('Tu rol no permite esta acción')
    }
  }
}
