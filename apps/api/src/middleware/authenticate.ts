import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyClerkToken, resolveHubUser } from './clerk-auth'
import { Errors } from '../lib/errors'

/**
 * Verifica el token de sesión de hub_user del header `Authorization: Bearer <token>`.
 *
 * Auth ÚNICA: Clerk. El admin se autentica con Clerk (identidad federada); ya no
 * existe JWT propio. Se verifica el token contra Clerk y se resuelve el hub_user
 * por clerk_user_id.
 *
 * Un token de client_account NO resuelve a una fila de hub_user → cualquiera de las
 * rutas devuelve unauthorized, garantizando que el cruce admin↔cliente queda impedido.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta el token de acceso')
  }

  const token = header.slice('Bearer '.length)

  try {
    const clerkUserId = await verifyClerkToken(token)
    request.hubUser = await resolveHubUser(clerkUserId)
  } catch {
    throw Errors.unauthorized('Token de acceso inválido o expirado')
  }
}
