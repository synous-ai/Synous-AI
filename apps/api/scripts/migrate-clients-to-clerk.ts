/**
 * migrate-clients-to-clerk.ts
 *
 * One-off (idempotente): migra los client_account EXISTENTES (portal del cliente)
 * a Clerk como identity provider. Espejo de migrate-users-to-clerk.ts pero para
 * clientes (userType='client').
 *
 * Qué hace, por cada client_account activo SIN clerk_user_id:
 *   1. Busca el usuario en Clerk por email.
 *      - Si YA existe: vincula (backfill clerk_user_id) + asegura userType='client'.
 *      - Si NO existe: lo crea con un password random fuerte + publicMetadata.userType='client'.
 *        El cliente entra la primera vez por "¿Olvidaste tu contraseña?" en /portal/login
 *        (Clerk le manda el código de reset). El password generado NO se le envía.
 *   2. Setea client_account.clerk_user_id con el id de Clerk.
 *
 * Precondiciones: CLERK_SECRET_KEY real en el entorno + migración 0019 aplicada
 * (clerk_user_id en client_account).
 *
 * Correr con:  pnpm --filter api exec tsx scripts/migrate-clients-to-clerk.ts
 */

import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { and, eq, isNull } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { clientAccount } from '../src/db/schema'
import { env } from '../src/config/env'

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

/** Password random fuerte (el cliente lo resetea; nunca se le envía). */
function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  // Sin Math.random aquí sería ideal, pero esto es un script CLI puntual fuera del runtime.
  let out = ''
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return `Nous-${out}`
}

async function migrateClientsToClerk(): Promise<void> {
  console.log('🔄 Migrando client_account existentes a Clerk...')
  console.log(`   Clerk env: ${env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'PRODUCCIÓN' : 'desarrollo'}`)

  const pending = await db
    .select({ id: clientAccount.id, email: clientAccount.email })
    .from(clientAccount)
    .where(and(eq(clientAccount.isActive, true), isNull(clientAccount.clerkUserId)))

  if (pending.length === 0) {
    console.log('✅ No hay clientes pendientes. Todos tienen clerk_user_id.')
    return
  }

  console.log(`📋 Clientes a migrar: ${pending.length}`)
  let created = 0
  let linked = 0
  let failed = 0

  for (const c of pending) {
    console.log(`\n👤 ${c.email} (id: ${c.id})`)
    try {
      let clerkUserId: string
      const existing = await clerk.users.getUserList({ emailAddress: [c.email] })
      if (existing.data[0]) {
        clerkUserId = existing.data[0].id
        await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: { userType: 'client' } })
        console.log(`   ↩️  Ya existe en Clerk (${clerkUserId}). Vinculado + userType=client.`)
        linked++
      } else {
        const u = await clerk.users.createUser({
          emailAddress: [c.email],
          password: generateStrongPassword(),
          skipPasswordChecks: true,
          publicMetadata: { userType: 'client' },
        })
        clerkUserId = u.id
        console.log(`   ✅ Creado en Clerk (${clerkUserId}). Entra por reset de contraseña.`)
        created++
      }
      await db.update(clientAccount).set({ clerkUserId }).where(eq(clientAccount.id, c.id))
      console.log(`   💾 client_account.clerk_user_id actualizado.`)
    } catch (err: unknown) {
      failed++
      console.error(`   ❌ ERROR para ${c.email}:`, err instanceof Error ? err.message : String(err))
    }
  }

  console.log('\n─────────────────────────────────────────')
  console.log(`📊 Creados: ${created} · Vinculados: ${linked} · Fallidos: ${failed} / ${pending.length}`)
  if (created > 0) {
    console.log('   → Avisales a esos clientes que entren a /portal/login y usen "¿Olvidaste tu contraseña?".')
  }
}

migrateClientsToClerk()
  .catch((err) => { console.error('\n💥 Error fatal:', err); process.exit(1) })
  .finally(() => void closeDb())
