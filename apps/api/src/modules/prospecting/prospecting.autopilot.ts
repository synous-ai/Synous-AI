import { Queue, Worker } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { setterTenant, hubUser } from '../../db/schema'
import { getRedisConnectionOptions, isRedisConfigured } from '../../jobs/connection'
import { runProspectSearch } from './prospecting.service'
import { logSetterEvent } from '../setter/setter.events.service'

/**
 * Autopilot de prospección: cada 1h corre UNA búsqueda por tenant con autopilot
 * activo, ciclando deterministamente por las combinaciones nicho×ciudad. La
 * búsqueda ya deduplica por google_place_id, así que el loop no genera repetidos.
 */

const QUEUE_NAME = 'prospecting-autopilot'
const JOB_ID = 'scan'
const REPEAT_EVERY_MS = 60 * 60 * 1000 // 1 hora
const AUTOPILOT_LIMIT = 5

let queue: Queue | null = null
let worker: Worker | null = null

export async function runAutopilotScan(): Promise<{ ran: number }> {
  // Proyección explícita: solo los campos que usa el loop del autopilot.
  // businessBrief y evolutionInstance son datos sensibles de infraestructura
  // que este worker no necesita y no deben circular fuera del agente IA.
  const tenants = await db
    .select({
      id: setterTenant.id,
      portalId: setterTenant.portalId,
      prospectingNiches: setterTenant.prospectingNiches,
      prospectingCities: setterTenant.prospectingCities,
      prospectingAutopilotCursor: setterTenant.prospectingAutopilotCursor,
      prospectingServices: setterTenant.prospectingServices,
    })
    .from(setterTenant)
    .where(eq(setterTenant.prospectingAutopilot, true))

  let ran = 0
  for (const t of tenants) {
    const niches = t.prospectingNiches ?? []
    const cities = t.prospectingCities ?? []
    if (niches.length === 0 || cities.length === 0) continue

    // Combinaciones nicho×ciudad en orden determinista; el cursor avanza de a una.
    const combos: { niche: string; city: string }[] = []
    for (const niche of niches) for (const city of cities) combos.push({ niche, city })
    const combo = combos[t.prospectingAutopilotCursor % combos.length]!

    const [owner] = await db
      .select({ id: hubUser.id })
      .from(hubUser)
      .where(and(eq(hubUser.portalId, t.portalId), eq(hubUser.role, 'owner')))
      .limit(1)
    const [anyUser] = owner
      ? [owner]
      : await db.select({ id: hubUser.id }).from(hubUser).where(eq(hubUser.portalId, t.portalId)).limit(1)
    if (!anyUser) continue

    try {
      const result = await runProspectSearch(t.portalId, anyUser.id, {
        query: `${combo.niche} ${combo.city}`,
        limit: AUTOPILOT_LIMIT,
        ourServices: t.prospectingServices ?? undefined,
      })
      ran++
      void logSetterEvent({
        tenantId: t.id,
        type: 'autopilot',
        message: `Autopilot · ${combo.niche} en ${combo.city} → ${result.prospects.length} nuevos`,
        meta: { niche: combo.niche, city: combo.city, nuevos: result.prospects.length },
      })
    } catch (err) {
      console.error(
        `[autopilot] búsqueda falló (${combo.niche} ${combo.city}):`,
        err instanceof Error ? err.message : err,
      )
      void logSetterEvent({
        tenantId: t.id,
        level: 'error',
        type: 'autopilot',
        message: `Autopilot falló en ${combo.niche} ${combo.city}`,
        meta: { error: err instanceof Error ? err.message : String(err) },
      })
    } finally {
      await db
        .update(setterTenant)
        .set({ prospectingAutopilotCursor: t.prospectingAutopilotCursor + 1 })
        .where(eq(setterTenant.id, t.id))
    }
  }
  return { ran }
}

export async function setupProspectingAutopilot(): Promise<void> {
  if (!isRedisConfigured() || worker) return
  const connection = getRedisConnectionOptions()

  queue = new Queue(QUEUE_NAME, { connection })
  await queue.upsertJobScheduler(JOB_ID, { every: REPEAT_EVERY_MS })

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await runAutopilotScan()
      console.log(`[autopilot] scan — búsquedas corridas: ${result.ran}`)
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[autopilot] job ${job?.id ?? 'unknown'} falló:`, err)
  })
}

export async function closeProspectingAutopilot(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  if (queue) {
    await queue.close()
    queue = null
  }
}
