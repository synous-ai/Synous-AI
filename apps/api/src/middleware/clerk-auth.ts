/**
 * clerk-auth.ts
 *
 * Módulo compartido para verificación de tokens de Clerk y resolución de
 * hub_user. Usado por authenticate.ts (HTTP) y los WS handlers (notifications,
 * setter) para no duplicar la lógica de lookup.
 *
 * Flujo:
 *   1. verifyClerkToken(token) → verifica contra el JWKS de Clerk con secretKey
 *      y devuelve el sub (Clerk user_id). Lanza Errors.unauthorized si inválido.
 *   2. resolveHubUser(clerkUserId) → Redis best-effort GET → DB lookup → Redis SET TTL 300s.
 *      Lanza Errors.unauthorized si no existe o está inactivo.
 *
 * Caché Redis: PENDIENTE de implementación completa cuando se agregue `ioredis`
 * como dependencia directa de apps/api (`pnpm --filter api add ioredis`).
 * Por ahora, resolveHubUser va directo a DB en cada request. El TTL corto de Clerk
 * session tokens (~60s) y la bajo volumen de un equipo de 2 hace esto tolerable.
 * TODO: implementar caché cuando se instale ioredis directamente.
 */

import { verifyToken } from '@clerk/backend'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { hubUser, clientAccount } from '../db/schema'
import { env } from '../config/env'
import { Errors } from '../lib/errors'
import type { ClientTokenPayload } from './authenticate-client'

/** Payload normalizado que se setea en request.hubUser. */
export interface HubUserContext {
  /** hub_user.id interno (CUID2) — NO el Clerk user_id. Los ~33 handlers consumen este campo. */
  sub: string
  portalId: string
  role: string
}

/**
 * Verifica un token JWT de Clerk usando el secretKey de la API.
 * Retorna el sub (Clerk user_id) si es válido; lanza Errors.unauthorized si no.
 */
export async function verifyClerkToken(token: string): Promise<string> {
  try {
    const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY })
    return claims.sub
  } catch {
    throw Errors.unauthorized('Token de acceso inválido o expirado')
  }
}

/**
 * Resuelve un Clerk user_id al hub_user interno.
 * Lanza Errors.unauthorized si el usuario no existe o está inactivo.
 *
 * TODO: agregar caché Redis best-effort cuando se instale ioredis directamente
 * (`pnpm --filter api add ioredis`). Clave: `clerk:auth:{clerkUserId}`, TTL 300s.
 */
export async function resolveHubUser(clerkUserId: string): Promise<HubUserContext> {
  const [u] = await db
    .select({ sub: hubUser.id, portalId: hubUser.portalId, role: hubUser.role })
    .from(hubUser)
    .where(and(eq(hubUser.clerkUserId, clerkUserId), eq(hubUser.isActive, true)))
    .limit(1)

  if (!u) throw Errors.unauthorized('Usuario no autorizado')

  return { sub: u.sub, portalId: u.portalId, role: u.role }
}

/**
 * Invalida la entrada de caché Redis para un Clerk user_id.
 * No-op hasta que se instale ioredis directamente.
 * Llamar desde el webhook user.updated y user.deleted.
 */
export async function invalidateHubUserCache(_clerkUserId: string): Promise<void> {
  // TODO: implementar cuando se instale ioredis (`pnpm --filter api add ioredis`)
  // await redis.del(`clerk:auth:${_clerkUserId}`)
}

/**
 * Busca el client_account asociado al userId de Clerk.
 * Devuelve la forma exacta que authenticate-client setea en request.clientAccount:
 * { sub, portalId, contactId, type: 'client_access' }.
 * Lanza Errors.unauthorized si la cuenta no existe o está inactiva.
 *
 * Esta función es el equivalente de resolveHubUser para el portal del cliente.
 * No usa caché — el volumen de clientes es bajo y el token de Clerk es de corta duración.
 */
export async function resolveClientAccount(clerkUserId: string): Promise<ClientTokenPayload> {
  const [account] = await db
    .select({
      id: clientAccount.id,
      portalId: clientAccount.portalId,
      contactId: clientAccount.contactId,
    })
    .from(clientAccount)
    .where(
      and(
        eq(clientAccount.clerkUserId, clerkUserId),
        eq(clientAccount.isActive, true),
      ),
    )
    .limit(1)

  if (!account) {
    throw Errors.unauthorized('Cliente no encontrado o inactivo.')
  }

  return {
    sub: account.id,
    portalId: account.portalId,
    contactId: account.contactId,
    type: 'client_access' as const,
  }
}
