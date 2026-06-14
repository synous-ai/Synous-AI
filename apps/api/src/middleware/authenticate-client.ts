import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyClerkToken, resolveClientAccount } from './clerk-auth'
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
 * Verifica el token de sesión de Clerk y resuelve el client_account asociado.
 * Sólo admite clientes del portal: resolveClientAccount busca por `clerk_user_id`
 * en client_account. Un token de admin (hub_user) NO tiene fila ahí → unauthorized,
 * por lo que el cruce admin↔cliente queda impedido por la resolución en DB.
 * Setea `request.clientAccount` ({ sub, portalId, contactId, type:'client_access' }).
 */
export async function authenticateClient(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta el token de acceso del cliente')
  }
  const clerkUserId = await verifyClerkToken(header.slice('Bearer '.length))
  request.clientAccount = await resolveClientAccount(clerkUserId)
}
