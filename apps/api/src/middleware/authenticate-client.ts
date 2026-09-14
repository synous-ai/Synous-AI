import type { FastifyRequest, FastifyReply } from 'fastify'
import {
  verifyClerkToken,
  resolveClientAccount,
  findClientAccount,
  findHubUser,
  resolvePortalView,
  type PortalViewer,
} from './clerk-auth'
import { AppError, Errors } from '../lib/errors'

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
    /** Presente cuando un admin del equipo ve el portal de una empresa en solo lectura. */
    portalViewer?: PortalViewer
  }
}

/** Slug de la empresa cuyo portal pide ver un admin; lo manda el portal desde su subdominio. */
export const PORTAL_VIEW_HEADER = 'x-portal-view'

const READ_METHODS = new Set(['GET', 'HEAD'])

/**
 * Verifica el token de sesión de Clerk y resuelve el client_account asociado.
 * Setea `request.clientAccount` ({ sub, portalId, contactId, type:'client_access' }).
 *
 * Vista de admin: si el token es de un hub_user y el pedido trae
 * `X-Portal-View: <slug>`, se resuelve la cuenta de cliente de esa empresa y se
 * atiende en SOLO LECTURA (toda escritura → 403), con `request.portalViewer`
 * seteado. Esos rechazos no son 401 a propósito: el portal cierra la sesión de
 * Clerk ante un 401, y eso deslogueaba al admin también del panel.
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

  const account = await findClientAccount(clerkUserId)
  if (account) {
    request.clientAccount = account
    return
  }

  const hub = await findHubUser(clerkUserId)
  if (!hub) {
    request.clientAccount = await resolveClientAccount(clerkUserId)
    return
  }

  const slug = request.headers[PORTAL_VIEW_HEADER]
  if (typeof slug !== 'string' || !slug) {
    throw new AppError('PORTAL_VIEW_SLUG_REQUIRED', 'Para ver un portal como admin, abrilo desde el subdominio del cliente', 403)
  }
  if (!READ_METHODS.has(request.method)) {
    throw new AppError('PORTAL_VIEW_READ_ONLY', 'Estás viendo el portal como admin: es de solo lectura', 403)
  }

  const { account: viewed, viewer } = await resolvePortalView(hub, slug)
  request.clientAccount = viewed
  request.portalViewer = viewer
}
