/**
 * set-clerk-user-types.ts
 *
 * Script one-off (idempotente): setea publicMetadata.userType en Clerk para todos
 * los usuarios existentes que ya tienen clerk_user_id en la DB.
 *
 *   hub_user con clerk_user_id    → userType: 'admin'
 *   client_account con clerk_user_id → userType: 'client'
 *
 * Para qué sirve:
 *   - Backfill inicial al migrar al flujo con userType discriminator.
 *   - Corrección si algún usuario quedó sin userType en publicMetadata.
 *   - Idempotente: setear el mismo valor N veces no tiene efecto secundario.
 *
 * Uso:
 *   pnpm --filter api tsx scripts/set-clerk-user-types.ts
 *
 * Precondiciones:
 *   - CLERK_SECRET_KEY real en el entorno (sk_test_... o sk_live_...).
 *   - DATABASE_URL apuntando a la DB de dev/prod (NO la de test).
 *   - Migración 0019 aplicada (clerk_user_id en client_account).
 */

import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { isNotNull } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { hubUser, clientAccount } from '../src/db/schema'
import { env } from '../src/config/env'

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

async function main(): Promise<void> {
  console.log('🔄 Seteando publicMetadata.userType en Clerk para todos los usuarios...')
  console.log(`   Clerk env: ${env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'PRODUCCIÓN' : 'desarrollo'}`)

  // ── Hub users (admins) ────────────────────────────────────────────────────
  const admins = await db
    .select({ clerkUserId: hubUser.clerkUserId, email: hubUser.email })
    .from(hubUser)
    .where(isNotNull(hubUser.clerkUserId))

  console.log(`\n📋 Hub users (admins) con clerk_user_id: ${admins.length}`)

  let adminOk = 0
  let adminFail = 0

  for (const admin of admins) {
    try {
      await clerk.users.updateUserMetadata(admin.clerkUserId!, {
        publicMetadata: { userType: 'admin' },
      })
      console.log(`   [admin] ✅ ${admin.email} → userType=admin (${admin.clerkUserId})`)
      adminOk++
    } catch (err) {
      console.error(`   [admin] ❌ ${admin.email} → ERROR:`, err instanceof Error ? err.message : err)
      adminFail++
    }
  }

  // ── Client accounts ───────────────────────────────────────────────────────
  const clients = await db
    .select({ clerkUserId: clientAccount.clerkUserId, email: clientAccount.email })
    .from(clientAccount)
    .where(isNotNull(clientAccount.clerkUserId))

  console.log(`\n📋 Client accounts con clerk_user_id: ${clients.length}`)

  let clientOk = 0
  let clientFail = 0

  for (const client of clients) {
    try {
      await clerk.users.updateUserMetadata(client.clerkUserId!, {
        publicMetadata: { userType: 'client' },
      })
      console.log(`   [client] ✅ ${client.email} → userType=client (${client.clerkUserId})`)
      clientOk++
    } catch (err) {
      console.error(`   [client] ❌ ${client.email} → ERROR:`, err instanceof Error ? err.message : err)
      clientFail++
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────')
  console.log('📊 Resumen:')
  console.log(`   Admins: ${adminOk} ok / ${adminFail} fallidos`)
  console.log(`   Clientes: ${clientOk} ok / ${clientFail} fallidos`)

  if (adminFail + clientFail > 0) {
    console.log('\n⚠️  Algunos usuarios fallaron. Corré el script de nuevo para reintentar.')
    process.exit(1)
  }

  console.log('\n✅ Listo.')
  process.exit(0)
}

main()
  .catch((err) => {
    console.error('\n💥 Error fatal:', err)
    process.exit(1)
  })
  .finally(() => {
    void closeDb()
  })
