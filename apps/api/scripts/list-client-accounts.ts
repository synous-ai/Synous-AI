/**
 * list-client-accounts.ts — lista las cuentas del Client Portal con el estado
 * de su onboarding. Sirve para saber sobre qué email correr
 * `reset-client-onboarding.ts`.
 *
 * Uso: pnpm --filter api exec tsx scripts/list-client-accounts.ts
 */
import 'dotenv/config'
import { desc, eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { clientAccount, clientOnboarding, clientDealAccess, deal } from '../src/db/schema'

async function run(): Promise<void> {
  const rows = await db
    .select({
      email: clientAccount.email,
      isActive: clientAccount.isActive,
      clerkUserId: clientAccount.clerkUserId,
      dealName: deal.name,
      status: clientOnboarding.status,
      currentStep: clientOnboarding.currentStep,
    })
    .from(clientAccount)
    .leftJoin(clientDealAccess, eq(clientDealAccess.clientId, clientAccount.id))
    .leftJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .leftJoin(clientOnboarding, eq(clientOnboarding.dealId, clientDealAccess.dealId))
    .orderBy(desc(clientAccount.createdAt))

  if (rows.length === 0) {
    console.log('No hay client_account en esta base.')
    return
  }

  console.log(`${rows.length} cuenta(s) de cliente:\n`)
  for (const r of rows) {
    const onboarding = r.status ? `${r.status} (paso ${r.currentStep})` : 'sin onboarding'
    console.log(`  ${r.email}`)
    console.log(`    deal: ${r.dealName ?? '—'} · onboarding: ${onboarding}`)
    console.log(`    activo: ${r.isActive} · clerk: ${r.clerkUserId ? 'sí' : 'NO'}`)
    console.log('')
  }
}

run()
  .catch((e) => {
    console.error('💥', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => void closeDb())
