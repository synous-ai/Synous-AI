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
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db'
import { hubUser, clientAccount, clientDealAccess, company, deal } from '../db/schema'
import { env } from '../config/env'
import { AppError, Errors } from '../lib/errors'
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
  const u = await findHubUser(clerkUserId)
  if (!u) throw Errors.unauthorized('Usuario no autorizado')
  return u
}

/** Como `resolveHubUser`, pero devuelve `null` si no hay hub_user activo. */
export async function findHubUser(clerkUserId: string): Promise<HubUserContext | null> {
  const [u] = await db
    .select({ sub: hubUser.id, portalId: hubUser.portalId, role: hubUser.role })
    .from(hubUser)
    .where(and(eq(hubUser.clerkUserId, clerkUserId), eq(hubUser.isActive, true)))
    .limit(1)
  return u ?? null
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
  const account = await findClientAccount(clerkUserId)
  if (!account) {
    // Diagnóstico de sesiones "huérfanas": token de Clerk válido sin
    // client_account vinculado ni hub_user (típico: cuenta demo re-vinculada a
    // otro clerk_user_id). El front reacciona cerrando la sesión.
    console.warn(
      `[auth-client] Sesión de Clerk válida sin client_account vinculado (clerk_user_id=${clerkUserId}) → 401`,
    )
    throw Errors.unauthorized('Cliente no encontrado o inactivo.')
  }
  return account
}

/** Como `resolveClientAccount`, pero devuelve `null` si no hay cuenta activa. */
export async function findClientAccount(clerkUserId: string): Promise<ClientTokenPayload | null> {
  const [account] = await db
    .select({ id: clientAccount.id, portalId: clientAccount.portalId, contactId: clientAccount.contactId })
    .from(clientAccount)
    .where(and(eq(clientAccount.clerkUserId, clerkUserId), eq(clientAccount.isActive, true)))
    .limit(1)
  return account
    ? { sub: account.id, portalId: account.portalId, contactId: account.contactId, type: 'client_access' as const }
    : null
}

/** Admin del equipo que está viendo el portal de una empresa. */
export interface PortalViewer {
  hubUserId: string
  companyId: string
  companySlug: string
}

/**
 * Resuelve qué portal ve un admin del equipo en `<slug>.<raíz>`: la cuenta de
 * cliente del deal activo más reciente de esa empresa, prefiriendo la del
 * contacto principal. Así el admin ve exactamente lo que ve ese cliente.
 *
 * 404 `PORTAL_NOT_FOUND` si el slug no es una empresa del workspace del admin;
 * 404 `PORTAL_NOT_ACTIVATED` si la empresa todavía no tiene cuenta de cliente.
 */
export async function resolvePortalView(
  hub: HubUserContext,
  companySlug: string,
): Promise<{ account: ClientTokenPayload; viewer: PortalViewer }> {
  const [co] = await db
    .select({ id: company.id, slug: company.slug })
    .from(company)
    .where(and(eq(company.slug, companySlug), eq(company.portalId, hub.portalId), eq(company.archived, false)))
    .limit(1)
  if (!co?.slug) throw new AppError('PORTAL_NOT_FOUND', 'No existe un portal de cliente con esa dirección', 404)

  const [row] = await db
    .select({ id: clientAccount.id, portalId: clientAccount.portalId, contactId: clientAccount.contactId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .innerJoin(clientAccount, eq(clientAccount.id, clientDealAccess.clientId))
    .where(and(eq(deal.companyId, co.id), eq(deal.archived, false), eq(clientAccount.isActive, true)))
    .orderBy(sql`(${clientAccount.contactId} = ${deal.primaryContactId}) desc nulls last`, desc(deal.createdAt))
    .limit(1)
  if (!row) throw new AppError('PORTAL_NOT_ACTIVATED', 'Este cliente todavía no tiene el portal activado', 404)

  return {
    account: { sub: row.id, portalId: row.portalId, contactId: row.contactId, type: 'client_access' },
    viewer: { hubUserId: hub.sub, companyId: co.id, companySlug: co.slug },
  }
}
