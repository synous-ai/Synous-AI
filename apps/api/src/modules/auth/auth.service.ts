import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { hubUser } from '../../db/schema'
import { verifyPassword } from '../../lib/password'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt'
import { Errors } from '../../lib/errors'

type HubUserRow = typeof hubUser.$inferSelect

export interface PublicUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  portalId: string
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: PublicUser
}

function publicUser(u: HubUserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    portalId: u.portalId,
  }
}

function issueTokens(u: HubUserRow): AuthResult {
  return {
    accessToken: signAccessToken({ sub: u.id, portalId: u.portalId, role: u.role }),
    refreshToken: signRefreshToken({ sub: u.id, portalId: u.portalId }),
    user: publicUser(u),
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const [user] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  // Mismo error para usuario inexistente o password incorrecto (no filtrar info).
  if (!user || !user.isActive) throw Errors.unauthorized('Credenciales inválidas')
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) throw Errors.unauthorized('Credenciales inválidas')
  return issueTokens(user)
}

export async function refresh(token: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(token)
  const [user] = await db.select().from(hubUser).where(eq(hubUser.id, payload.sub)).limit(1)
  if (!user || !user.isActive) throw Errors.unauthorized('Sesión inválida')
  return issueTokens(user)
}

export async function getCurrentUser(id: string): Promise<PublicUser> {
  const [user] = await db.select().from(hubUser).where(eq(hubUser.id, id)).limit(1)
  if (!user) throw Errors.notFound('Usuario no encontrado')
  return publicUser(user)
}
