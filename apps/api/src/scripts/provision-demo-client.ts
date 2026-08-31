/**
 * provision-demo-client.ts — one-off de desarrollo.
 *
 * Crea (o actualiza) el usuario de Clerk para el cliente demo del seed
 * (cliente@demo.com) con una contraseña conocida, marca su email como
 * verificado y vincula el clerk_user_id real en client_account (el seed
 * deja un placeholder que no existe en Clerk y bloquea el login).
 *
 * Correr con:  pnpm --filter api exec tsx src/scripts/provision-demo-client.ts
 */
import { createClerkClient } from '@clerk/backend'
import { eq } from 'drizzle-orm'
import { env } from '../config/env'
import { db, closeDb } from '../db'
import { clientAccount } from '../db/schema'

/**
 * Email de LOGIN en Clerk: usa el sufijo +clerk_test (modo test de Clerk dev):
 * no envía emails reales y todo código de verificación es 424242 — evita el
 * paso de "device verification" que manda un código a un buzón inexistente.
 * La fila de client_account conserva cliente@demo.com: el auth resuelve por
 * clerk_user_id, no por email.
 */
const CLERK_EMAIL = 'cliente+clerk_test@demo.com'
const ACCOUNT_EMAIL = 'cliente@demo.com'
const PASSWORD = process.env['DEMO_CLIENT_PASSWORD'] ?? 'DemoCliente#2026'

async function main(): Promise<void> {
  if (!env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY no configurada')
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

  // 1. Find-or-create del usuario en Clerk, con password conocida.
  const list = await clerk.users.getUserList({ emailAddress: [CLERK_EMAIL], limit: 1 })
  let user = list.data?.[0] ?? null
  if (user) {
    user = await clerk.users.updateUser(user.id, { password: PASSWORD, skipPasswordChecks: true })
    await clerk.users.updateUserMetadata(user.id, { publicMetadata: { userType: 'client' } })
    console.log(`· usuario ya existía en Clerk (${user.id}) — password actualizada`)
  } else {
    user = await clerk.users.createUser({
      emailAddress: [CLERK_EMAIL],
      firstName: 'Cliente',
      lastName: 'Demo',
      password: PASSWORD,
      skipPasswordChecks: true,
      publicMetadata: { userType: 'client' },
    })
    console.log(`✓ usuario creado en Clerk (${user.id})`)
  }

  // 2. Email verificado (el lazy-linking y algunos flujos lo exigen).
  const primary = user.emailAddresses.find((e) => e.id === user!.primaryEmailAddressId)
  if (primary && primary.verification?.status !== 'verified') {
    await clerk.emailAddresses.updateEmailAddress(primary.id, { verified: true })
    console.log('✓ email marcado como verificado')
  }

  // 3. Vincular el clerk_user_id real en la fila del client_account demo.
  const [updated] = await db
    .update(clientAccount)
    .set({ clerkUserId: user.id, inviteAccepted: true })
    .where(eq(clientAccount.email, ACCOUNT_EMAIL))
    .returning({ id: clientAccount.id, clerkUserId: clientAccount.clerkUserId })
  if (!updated) throw new Error(`No existe client_account con email ${ACCOUNT_EMAIL} — corré el seed primero`)
  console.log(`✓ client_account ${updated.id} vinculado a ${updated.clerkUserId}`)
  console.log(`\nLogin del portal: ${CLERK_EMAIL} / ${PASSWORD}`)
  console.log('Si Clerk pide un código de verificación: 424242')
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Falló el provisioning del cliente demo:', err)
    await closeDb()
    process.exit(1)
  })
