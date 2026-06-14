import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyClerkToken, resolveHubUser } from './clerk-auth'
import { Errors } from '../lib/errors'

/**
 * Verifica el token de sesión de Clerk del header `Authorization: Bearer <token>`.
 * Sólo admite admins (hub_user): verifica el token contra Clerk y resuelve el
 * hub_user interno por `clerk_user_id`. Setea `request.hubUser` ({ sub, portalId, role }).
 *
 * El gate real de autorización es la resolución en DB: un token de cliente
 * (client_account) NO tiene fila en hub_user → resolveHubUser lanza unauthorized.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta el token de acceso')
  }
  const clerkUserId = await verifyClerkToken(header.slice('Bearer '.length))
  request.hubUser = await resolveHubUser(clerkUserId)
}
