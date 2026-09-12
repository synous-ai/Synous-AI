import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { hubUser, portal } from '../../db/schema'
import { Errors } from '../../lib/errors'

type HubUserRow = typeof hubUser.$inferSelect

export interface PublicUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  portalId: string
  /**
   * Slug legible del portal. Lo usa el admin para construir la URL pública de
   * reservas (`/book/:portalSlug/:eventSlug`) sin exponer el cuid del portal.
   * Null en portales creados antes de la columna — ahí se cae al portalId.
   */
  portalSlug: string | null
}

function publicUser(u: HubUserRow, portalSlug: string | null): PublicUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    portalId: u.portalId,
    portalSlug,
  }
}

/**
 * Devuelve los datos públicos del hub_user autenticado. La autenticación (Clerk)
 * la resuelve el middleware `authenticate`; acá solo consultamos la fila por id.
 */
export async function getCurrentUser(id: string): Promise<PublicUser> {
  const [user] = await db.select().from(hubUser).where(eq(hubUser.id, id)).limit(1)
  if (!user) throw Errors.notFound('Usuario no encontrado')
  const [p] = await db.select({ slug: portal.slug }).from(portal).where(eq(portal.id, user.portalId)).limit(1)
  return publicUser(user, p?.slug ?? null)
}
