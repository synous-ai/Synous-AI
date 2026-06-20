/**
 * clerk-provisioning.ts — alta/sincronización de usuarios en Clerk desde el backend.
 *
 * El admin (hub_user) y el cliente (client_account) se autentican con Clerk. Este helper
 * centraliza el "find-or-create" del usuario de Clerk con su `publicMetadata.userType`
 * ya seteado, para que el discriminador de tipo quede automático al crear usuarios
 * (sin depender del script set-clerk-user-types).
 *
 * El `userType` se usa para el ruteo de conveniencia del middleware (admin ↔ portal).
 * El gate real de auth sigue siendo el lookup en DB por clerk_user_id.
 */
import { createClerkClient } from '@clerk/backend'
import { env } from '../config/env'

export type UserType = 'admin' | 'client'

// Cliente Clerk lazy: se instancia solo cuando se necesita (y solo si hay secret key).
let _client: ReturnType<typeof createClerkClient> | null = null
function clerk(): ReturnType<typeof createClerkClient> {
  if (!_client) _client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  return _client
}

/**
 * Asegura que exista un usuario de Clerk para `email` con `publicMetadata.userType`.
 *
 * - Si ya existe en Clerk → actualiza su `userType` y devuelve su id.
 * - Si no existe → lo crea (sin password: el usuario fija su acceso por email-code /
 *   Google / invitación) con el `userType` seteado, y devuelve el id nuevo.
 *
 * Best-effort: si falta `CLERK_SECRET_KEY` o Clerk falla, loguea y devuelve `null` —
 * NUNCA rompe la operación de negocio que lo invoca (crear usuario / activar portal).
 *
 * @returns el `clerkUserId` para guardar en la fila de DB, o `null` si no se pudo.
 */
export async function ensureClerkUserType(args: {
  email: string
  firstName?: string | null
  lastName?: string | null
  userType: UserType
}): Promise<string | null> {
  if (!env.CLERK_SECRET_KEY) return null
  const { email, firstName, lastName, userType } = args
  try {
    const c = clerk()
    const list = await c.users.getUserList({ emailAddress: [email], limit: 1 })
    const found = list.data?.[0]
    if (found) {
      await c.users.updateUserMetadata(found.id, { publicMetadata: { userType } })
      return found.id
    }
    const created = await c.users.createUser({
      emailAddress: [email],
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      publicMetadata: { userType },
      skipPasswordRequirement: true,
    })
    return created.id
  } catch (err) {
    console.error(
      `[clerk-provisioning] No se pudo provisionar el usuario de Clerk (${email}, ${userType}):`,
      (err as Error)?.message ?? err,
    )
    return null
  }
}
