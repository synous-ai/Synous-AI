import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken } from '../lib/jwt'
import { Errors } from '../lib/errors'

/**
 * Verifica el access token del header `Authorization: Bearer <token>`.
 * Sólo valida tokens de admin (hub_user). Setea `request.hubUser`.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta el token de acceso')
  }
  request.hubUser = verifyAccessToken(header.slice('Bearer '.length))
}
