/**
 * link-hub-users.ts — one-off operativo.
 *
 * El seed crea hub_users con clerkUserId placeholder ('clerk_seed_*') que no
 * existen en Clerk, y resolveHubUser busca estrictamente por clerk_user_id —
 * resultado: 401 en todo el admin para sesiones reales. Este script recorre
 * los hub_users con placeholder, hace find-or-create del usuario en Clerk por
 * email (con publicMetadata.userType='admin' para el routing del middleware)
 * y guarda el clerk_user_id REAL en la fila.
 *
 * Correr contra la DB que corresponda (dev o prod con el env sourced):
 *   pnpm --filter api exec tsx src/scripts/link-hub-users.ts
 */
import { like, eq } from 'drizzle-orm'
import { db, closeDb } from '../db'
import { hubUser } from '../db/schema'
import { ensureClerkUserType } from '../lib/clerk-provisioning'

async function main(): Promise<void> {
  const placeholders = await db
    .select({ id: hubUser.id, email: hubUser.email, firstName: hubUser.firstName })
    .from(hubUser)
    .where(like(hubUser.clerkUserId, 'clerk_seed_%'))

  if (placeholders.length === 0) {
    console.log('No hay hub_users con clerkUserId placeholder — nada que hacer.')
    return
  }

  for (const u of placeholders) {
    const clerkUserId = await ensureClerkUserType({
      email: u.email,
      firstName: u.firstName,
      userType: 'admin',
    })
    if (!clerkUserId) {
      console.log(`✗ ${u.email}: no se pudo resolver/crear en Clerk (ver log de arriba) — fila sin tocar`)
      continue
    }
    await db.update(hubUser).set({ clerkUserId }).where(eq(hubUser.id, u.id))
    console.log(`✓ ${u.email} → ${clerkUserId}`)
  }
  console.log('Listo. Los hub_users linkeados ya pueden entrar al admin.')
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Falló el linking de hub_users:', err)
    await closeDb()
    process.exit(1)
  })
