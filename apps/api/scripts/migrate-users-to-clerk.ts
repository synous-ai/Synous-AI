/**
 * migrate-users-to-clerk.ts
 *
 * Script one-time (idempotente) para migrar los usuarios admin (hub_user) existentes
 * a Clerk como identity provider.
 *
 * Qué hace:
 *   1. Busca hub_users activos sin clerk_user_id (aún no migrados).
 *   2. Por cada uno: intenta encontrar el usuario en Clerk por email.
 *      - Si YA existe en Clerk: vincula (backfill clerk_user_id) sin duplicar.
 *      - Si NO existe en Clerk: lo crea usando el hash bcrypt existente
 *        (passwordHasher: 'bcrypt', rounds ≤ 12 confirmado). El usuario puede
 *        hacer login con su contraseña actual sin resetearla.
 *   3. Actualiza hub_user.clerk_user_id con el ID de Clerk retornado.
 *
 * Idempotencia: correr N veces es seguro. Usuarios con clerk_user_id ya seteado
 * se saltean. Usuarios cuyo email ya existe en Clerk se vinculan sin duplicar.
 *
 * Precondiciones:
 *   - CLERK_SECRET_KEY real seteado en el entorno (no el dummy de tests).
 *     Formato: sk_test_... en dev / sk_live_... en prod.
 *   - DATABASE_URL apuntando a la DB de dev/prod (NO la de test).
 *   - Migración 0015_graceful_zemo.sql ya aplicada (clerk_user_id column existe).
 *
 * Correr con:
 *   pnpm --filter api migrate:clerk
 *
 * En caso de error por bcrypt cost factor > 12: el script falla con un mensaje
 * claro indicando qué usuario necesita reset manual. El fallback es enviar un
 * "invite email" desde el Dashboard de Clerk para que el usuario setee su contraseña.
 */

import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { eq, isNull, and } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { hubUser } from '../src/db/schema'
import { env } from '../src/config/env'

// ── Inicializar Clerk Backend client ──────────────────────────────────────────

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

// ── Función principal ─────────────────────────────────────────────────────────

async function migrateUsersToClerk(): Promise<void> {
  console.log('🔄 Iniciando migración de hub_users a Clerk...')
  console.log(`   Clerk environment: ${env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'PRODUCCIÓN' : 'desarrollo'}`)

  // 1. Buscar usuarios activos sin clerk_user_id
  const pendingUsers = await db
    .select({
      id: hubUser.id,
      email: hubUser.email,
      passwordHash: hubUser.passwordHash,
      firstName: hubUser.firstName,
      lastName: hubUser.lastName,
    })
    .from(hubUser)
    .where(and(eq(hubUser.isActive, true), isNull(hubUser.clerkUserId)))

  if (pendingUsers.length === 0) {
    console.log('✅ No hay usuarios pendientes de migrar. Todos ya tienen clerk_user_id.')
    return
  }

  console.log(`📋 Usuarios a migrar: ${pendingUsers.length}`)

  let migrated = 0
  let linked = 0
  let failed = 0

  for (const user of pendingUsers) {
    console.log(`\n👤 Procesando: ${user.email} (id: ${user.id})`)

    try {
      let clerkUserId: string

      // 2a. Verificar si el usuario ya existe en Clerk por email (evitar duplicados)
      const existingList = await clerk.users.getUserList({
        emailAddress: [user.email],
      })
      const existingClerkUser = existingList.data[0]

      if (existingClerkUser) {
        // Ya existe en Clerk → solo vincular (backfill)
        clerkUserId = existingClerkUser.id
        console.log(`   ↩️  Ya existe en Clerk (id: ${clerkUserId}). Vinculando sin duplicar.`)
        linked++
      } else {
        // No existe → crear con el hash bcrypt existente
        // PRECONDICIÓN: bcrypt cost factor ≤ 12.
        // Clerk importa el hash directamente; el usuario logueará con su contraseña actual.
        const createdUser = await clerk.users.createUser({
          emailAddress: [user.email],
          passwordDigest: user.passwordHash,
          passwordHasher: 'bcrypt',
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          // skipPasswordChecks: true — no aplicar políticas de password a hashes importados
          skipPasswordChecks: true,
          // Marcar como admin para que el webhook y los middlewares puedan discriminar
          // entre hub_user (admin) y client_account (cliente del portal).
          publicMetadata: { userType: 'admin' },
        })
        clerkUserId = createdUser.id
        console.log(`   ✅ Creado en Clerk (id: ${clerkUserId})`)
        migrated++
      }

      // 3. Backfill clerk_user_id en hub_user
      await db
        .update(hubUser)
        .set({ clerkUserId, updatedAt: new Date() })
        .where(eq(hubUser.id, user.id))

      console.log(`   💾 hub_user.clerk_user_id actualizado: ${clerkUserId}`)
    } catch (err: unknown) {
      failed++
      const message = err instanceof Error ? err.message : String(err)

      // Detectar error de bcrypt cost factor > 12 (límite de Clerk)
      if (message.toLowerCase().includes('cost') || message.toLowerCase().includes('factor')) {
        console.error(`   ❌ ERROR: bcrypt cost factor > 12 para ${user.email}.`)
        console.error(`   📧 ACCIÓN REQUERIDA: enviar invite de password reset desde el Dashboard de Clerk.`)
        console.error(`      https://dashboard.clerk.com → Users → Invitations → Send invite to ${user.email}`)
      } else {
        console.error(`   ❌ ERROR inesperado para ${user.email}:`, message)
      }
    }
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────')
  console.log('📊 Resumen de migración:')
  console.log(`   ✅ Creados en Clerk:  ${migrated}`)
  console.log(`   ↩️  Vinculados (ya existían en Clerk): ${linked}`)
  if (failed > 0) {
    console.log(`   ❌ Fallidos (requieren acción manual): ${failed}`)
    console.log('   → Ver mensajes de error arriba para instrucciones de cada usuario.')
  }

  const total = migrated + linked
  console.log(`   Total migrados exitosamente: ${total} / ${pendingUsers.length}`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

migrateUsersToClerk()
  .catch((err) => {
    console.error('\n💥 Error fatal en migración:', err)
    process.exit(1)
  })
  .finally(() => {
    void closeDb()
  })
