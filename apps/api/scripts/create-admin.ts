/**
 * create-admin.ts
 *
 * Script one-off (idempotente) para crear una cuenta de admin (hub_user) con
 * identidad federada en Clerk. Crea el usuario en Clerk (email + password) y el
 * hub_user vinculado por clerk_user_id, con role 'owner'.
 *
 * Uso:
 *   pnpm --filter api tsx scripts/create-admin.ts <email> <password> [firstName]
 *   (sin args usa los valores por defecto de abajo)
 *
 * Idempotente: si el email ya existe en Clerk se reusa; si el hub_user ya existe
 * se vincula/actualiza sin duplicar.
 *
 * Precondiciones: CLERK_SECRET_KEY real en el entorno + DB migrada (clerk_user_id).
 */

import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { asc, eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { portal, hubUser } from '../src/db/schema'
import { hashPassword } from '../src/lib/password'
import { env } from '../src/config/env'

const email = (process.argv[2] ?? 'jeremiasingla@gmail.com').toLowerCase()
const password = process.argv[3] ?? 'Jeremias2001@'
const firstName = process.argv[4] ?? 'Jeremias'
const role = 'owner' as const

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

async function createAdmin(): Promise<void> {
  console.log(`🔑 Creando admin: ${email}`)
  console.log(`   Clerk env: ${env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'PRODUCCIÓN' : 'desarrollo'}`)

  // 1. Portal (el primero — single-tenant)
  const [p] = await db.select().from(portal).orderBy(asc(portal.createdAt)).limit(1)
  if (!p) throw new Error('No hay ningún portal. Corré primero el seed (pnpm --filter api db:seed).')
  const portalId = p.id

  // 2. Usuario en Clerk (crear o reusar por email)
  let clerkUserId: string
  const existing = await clerk.users.getUserList({ emailAddress: [email] })
  if (existing.data[0]) {
    clerkUserId = existing.data[0].id
    console.log(`   ↩️  Ya existe en Clerk (id: ${clerkUserId}). Reuso.`)
  } else {
    const created = await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName,
      skipPasswordChecks: true, // password ya fuerte; evita rechazo por políticas
      publicMetadata: { userType: 'admin' },
    })
    clerkUserId = created.id
    console.log(`   ✅ Creado en Clerk (id: ${clerkUserId})`)
  }

  // 3. hub_user (insertar o vincular). passwordHash es NOT NULL aunque el auth
  //    real lo maneja Clerk; guardamos el hash para satisfacer la constraint.
  const [existingHub] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  if (existingHub) {
    await db
      .update(hubUser)
      .set({ clerkUserId, role, isActive: true, updatedAt: new Date() })
      .where(eq(hubUser.id, existingHub.id))
    console.log(`   💾 hub_user existente vinculado (id: ${existingHub.id}, role: ${role})`)
  } else {
    const [u] = await db
      .insert(hubUser)
      .values({
        portalId,
        email,
        firstName,
        passwordHash: await hashPassword(password),
        role,
        clerkUserId,
      })
      .returning()
    console.log(`   💾 hub_user creado (id: ${u!.id}, role: ${role})`)
  }

  console.log(`\n✅ Listo. Logueá con ${email} y tu contraseña en /admin/login.`)
  console.log('   (Si Client Trust está activo, te pedirá un código por email la primera vez.)')
}

createAdmin()
  .catch((err) => {
    console.error('\n💥 Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => {
    void closeDb()
  })
