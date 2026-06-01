import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { db } from '../../db'
import { clientAccount } from '../../db/schema'
import { hashPassword, verifyPassword } from '../../lib/password'
import { env } from '../../config/env'
import { Errors } from '../../lib/errors'
import type { ClientTokenPayload } from '../../middleware/authenticate-client'

// ─── Token shapes ──────────────────────────────────────────────────────────────

interface ClientRefreshTokenPayload {
  sub: string
  portalId: string
  contactId: string
  type: 'client_refresh'
}

// ─── Helpers de token — DISTINTOS a los de hub_user ───────────────────────────
// Usan el mismo secreto pero el campo `type` los hace incompatibles:
//   hub_user  → 'access' / 'refresh'
//   client    → 'client_access' / 'client_refresh'

function signClientAccessToken(
  payload: Omit<ClientTokenPayload, 'type'>,
): string {
  return jwt.sign(
    { ...payload, type: 'client_access' },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL } as jwt.SignOptions,
  )
}

function signClientRefreshToken(
  payload: Omit<ClientRefreshTokenPayload, 'type'>,
): string {
  return jwt.sign(
    { ...payload, type: 'client_refresh' },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: env.REFRESH_TOKEN_TTL } as jwt.SignOptions,
  )
}

function verifyClientRefreshToken(token: string): ClientRefreshTokenPayload {
  try {
    const decoded = jwt.verify(
      token,
      env.REFRESH_TOKEN_SECRET,
    ) as unknown as ClientRefreshTokenPayload
    if (decoded.type !== 'client_refresh') {
      throw Errors.unauthorized('Tipo de token inválido para el portal del cliente')
    }
    return decoded
  } catch (err) {
    if (err instanceof Error && err.name === 'AppError') throw err
    throw Errors.unauthorized('Refresh token del cliente inválido o expirado')
  }
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

type ClientAccountRow = typeof clientAccount.$inferSelect

export interface PublicClientAccount {
  id: string
  email: string
  portalId: string
  contactId: string
  isActive: boolean
  inviteAccepted: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export interface ClientAuthResult {
  accessToken: string
  refreshToken: string
  client: PublicClientAccount
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function toPublicClient(row: ClientAccountRow): PublicClientAccount {
  return {
    id: row.id,
    email: row.email,
    portalId: row.portalId,
    contactId: row.contactId,
    isActive: row.isActive,
    inviteAccepted: row.inviteAccepted,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }
}

function issueClientTokens(row: ClientAccountRow): ClientAuthResult {
  const tokenBase = { sub: row.id, portalId: row.portalId, contactId: row.contactId }
  return {
    accessToken: signClientAccessToken(tokenBase),
    refreshToken: signClientRefreshToken(tokenBase),
    client: toPublicClient(row),
  }
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

/**
 * Acepta la invitación del cliente: valida el token de invitación, setea la
 * contraseña y marca la cuenta como activada. Devuelve tokens + datos públicos.
 */
export async function acceptInvite(
  inviteToken: string,
  password: string,
): Promise<ClientAuthResult> {
  const [account] = await db
    .select()
    .from(clientAccount)
    .where(eq(clientAccount.inviteToken, inviteToken))
    .limit(1)

  if (!account || !account.isActive) {
    throw Errors.notFound('Token de invitación no encontrado o inválido')
  }
  if (account.inviteAccepted) {
    throw Errors.conflict('La invitación ya fue aceptada')
  }

  const passwordHash = await hashPassword(password)
  const now = new Date()

  const [updated] = await db
    .update(clientAccount)
    .set({
      passwordHash,
      inviteAccepted: true,
      lastLoginAt: now,
      // Anular el token de invitación para que no pueda reutilizarse
      inviteToken: null,
    })
    .where(eq(clientAccount.id, account.id))
    .returning()

  if (!updated) throw Errors.internal('Error al activar la cuenta del cliente')

  return issueClientTokens(updated)
}

/**
 * Inicia sesión de un cliente. Busca por email (citext, case-insensitive),
 * verifica la contraseña y actualiza lastLoginAt.
 */
export async function clientLogin(
  email: string,
  password: string,
): Promise<ClientAuthResult> {
  const [account] = await db
    .select()
    .from(clientAccount)
    .where(eq(clientAccount.email, email))
    .limit(1)

  // Mismo error para cuenta inexistente o password incorrecto (no filtrar info)
  if (!account || !account.isActive) {
    throw Errors.unauthorized('Credenciales inválidas')
  }
  if (!account.inviteAccepted || !account.passwordHash) {
    throw Errors.unauthorized('La cuenta aún no ha sido activada')
  }

  const valid = await verifyPassword(password, account.passwordHash)
  if (!valid) throw Errors.unauthorized('Credenciales inválidas')

  const [updated] = await db
    .update(clientAccount)
    .set({ lastLoginAt: new Date() })
    .where(eq(clientAccount.id, account.id))
    .returning()

  if (!updated) throw Errors.internal('Error al iniciar sesión')

  return issueClientTokens(updated)
}

/**
 * Rota el refresh token del cliente. Verifica que sea un token de tipo
 * 'client_refresh' — NUNCA acepta tokens de hub_user.
 */
export async function clientRefresh(token: string): Promise<ClientAuthResult> {
  const payload = verifyClientRefreshToken(token)

  const [account] = await db
    .select()
    .from(clientAccount)
    .where(eq(clientAccount.id, payload.sub))
    .limit(1)

  if (!account || !account.isActive) {
    throw Errors.unauthorized('Sesión del cliente inválida')
  }

  return issueClientTokens(account)
}

/**
 * Devuelve los datos públicos de un clientAccount por su id.
 * No incluye passwordHash ni inviteToken.
 */
export async function getClientAccount(id: string): Promise<PublicClientAccount> {
  const [account] = await db
    .select()
    .from(clientAccount)
    .where(eq(clientAccount.id, id))
    .limit(1)

  if (!account) throw Errors.notFound('Cuenta de cliente no encontrada')
  return toPublicClient(account)
}
