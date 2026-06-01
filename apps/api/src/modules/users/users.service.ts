import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { hubUser } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { hashPassword } from '../../lib/password'
import type { CreateUserDTO, UpdateUserDTO } from './users.schema'

export interface PublicUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  isActive: boolean
}

const publicCols = {
  id: hubUser.id,
  email: hubUser.email,
  firstName: hubUser.firstName,
  lastName: hubUser.lastName,
  role: hubUser.role,
  isActive: hubUser.isActive,
}

export async function listUsers(portalId: string): Promise<PublicUser[]> {
  return db.select(publicCols).from(hubUser).where(eq(hubUser.portalId, portalId)).orderBy(asc(hubUser.id))
}

export async function createUser(portalId: string, input: CreateUserDTO): Promise<PublicUser> {
  const [existing] = await db
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.email, input.email)))
    .limit(1)
  if (existing) throw Errors.conflict('Ya existe un usuario con ese email')

  const [row] = await db
    .insert(hubUser)
    .values({
      portalId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning(publicCols)
  if (!row) throw Errors.internal('No se pudo crear el usuario')
  return row
}

export async function updateUser(portalId: string, id: string, input: UpdateUserDTO): Promise<PublicUser> {
  const [existing] = await db
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.id, id)))
    .limit(1)
  if (!existing) throw Errors.notFound('Usuario no encontrado')
  const [row] = await db
    .update(hubUser)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(hubUser.id, id))
    .returning(publicCols)
  return row!
}
