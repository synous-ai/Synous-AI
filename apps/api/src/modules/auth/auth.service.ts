import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { hubUser } from '../../db/schema'
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

/**
 * Devuelve los datos públicos del hub_user autenticado. La autenticación (Clerk)
 * la resuelve el middleware `authenticate`; acá solo consultamos la fila por id.
 */
export async function getCurrentUser(id: string): Promise<PublicUser> {
  const [user] = await db.select().from(hubUser).where(eq(hubUser.id, id)).limit(1)
  if (!user) throw Errors.notFound('Usuario no encontrado')
  return publicUser(user)
}
