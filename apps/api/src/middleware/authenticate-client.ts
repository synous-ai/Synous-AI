import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Errors } from '../lib/errors'

export interface ClientTokenPayload {
  sub: string      // client_account.id (CUID2)
  portalId: string
  contactId: string
  type: 'client_access'
}

// Augmentación de tipos para FastifyRequest — SOLO para client_account.
// Los tokens de hub_user viven en request.hubUser (fastify.d.ts). Estos son DISTINTOS.
declare module 'fastify' {
  interface FastifyRequest {
    /** Cliente autenticado (seteado por el middleware `authenticateClient`). */
    clientAccount?: ClientTokenPayload
  }
}

/**
 * Verifica el access token del header `Authorization: Bearer <token>`.
 * Sólo valida tokens de cliente (type 'client_access'). Setea `request.clientAccount`.
 * NUNCA acepta tokens de hub_user; el type discriminator impide el cruce.
 */
export async function authenticateClient(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta el token de acceso del cliente')
  }

  const token = header.slice('Bearer '.length)

  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as unknown as ClientTokenPayload
    if (decoded.type !== 'client_access') {
      throw Errors.unauthorized('Tipo de token inválido para el portal del cliente')
    }
    request.clientAccount = decoded
  } catch (err) {
    if (err instanceof Error && err.name === 'AppError') throw err
    throw Errors.unauthorized('Token de acceso del cliente inválido o expirado')
  }
}
