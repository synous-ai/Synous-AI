/**
 * set-portal-timezone.ts — one-off: pone la zona horaria de TODOS los portals
 * (y schedules/reglas existentes que sigan en Bogotá) en Buenos Aires, Argentina.
 *
 * Uso: pnpm --filter api exec tsx scripts/set-portal-timezone.ts [IANA_TZ]
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { portal, availabilitySchedule, availabilityRule } from '../src/db/schema'

const TZ = process.argv[2] ?? 'America/Argentina/Buenos_Aires'

async function run(): Promise<void> {
  const portals = await db.update(portal).set({ timeZone: TZ, updatedAt: new Date() }).returning({ id: portal.id })
  const scheds = await db.update(availabilitySchedule).set({ timeZone: TZ }).where(eq(availabilitySchedule.timeZone, 'America/Bogota')).returning({ id: availabilitySchedule.id })
  const rules = await db.update(availabilityRule).set({ timeZone: TZ }).where(eq(availabilityRule.timeZone, 'America/Bogota')).returning({ id: availabilityRule.id })
  console.log(`✅ Zona horaria → ${TZ}`)
  console.log(`   portals: ${portals.length} · schedules migrados: ${scheds.length} · reglas: ${rules.length}`)
}

run()
  .catch((e) => { console.error('💥', e instanceof Error ? e.message : e); process.exit(1) })
  .finally(() => void closeDb())
