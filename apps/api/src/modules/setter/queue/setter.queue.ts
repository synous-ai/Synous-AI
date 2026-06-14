import { Queue, Worker } from 'bullmq'
import { getRedisConnectionOptions, isRedisConfigured } from '../../../jobs/connection'
import { runAgentTurn } from '../agent/brain'

/**
 * Cola de mensajes entrantes del setter.
 *
 * Sprint 0 (Fase 0): solo se crea el wiring de la cola para validar que BullMQ +
 * Redis están operativos. El worker que consume `handle-message` (webhook →
 * cola → cerebro) se implementa en Fase 2/3. Guardrail: el webhook responde 200
 * y encola; NUNCA se llama al LLM dentro del request.
 */

export const SETTER_INBOUND_QUEUE = 'setter-inbound'

let inboundQueue: Queue | null = null
let inboundWorker: Worker | null = null

/**
 * Devuelve (o crea) la cola de entrantes del setter. Lanza si Redis no está
 * configurado — los callers deben chequear `isRedisConfigured()` antes.
 */
export function getSetterInboundQueue(): Queue {
  if (!isRedisConfigured()) {
    throw new Error('REDIS_URL no configurado — la cola del setter no está disponible')
  }
  if (!inboundQueue) {
    inboundQueue = new Queue(SETTER_INBOUND_QUEUE, { connection: getRedisConnectionOptions() })
  }
  return inboundQueue
}

/** Estado de la cola para el health check del setter. */
export async function pingSetterQueue(): Promise<'ok' | 'not_configured' | 'unreachable'> {
  if (!isRedisConfigured()) {
    return 'not_configured'
  }
  try {
    const queue = getSetterInboundQueue()
    await queue.waitUntilReady()
    return 'ok'
  } catch {
    return 'unreachable'
  }
}

/**
 * Bootstrapa el worker que consume `handle-message` (webhook → cola → agente).
 *
 * Corre el cerebro (Gemini) y genera un Draft en la cola de aprobación. Shadow
 * mode: NUNCA envía nada. Solo se llama si Redis está configurado.
 */
export function setupSetterWorker(): void {
  if (!isRedisConfigured() || inboundWorker) return
  const connection = getRedisConnectionOptions()

  inboundWorker = new Worker(
    SETTER_INBOUND_QUEUE,
    async (job) => {
      const { leadId } = job.data as { leadId: string }
      const result = await runAgentTurn(leadId)
      console.log(
        `[setter] handle-message — lead ${leadId} → draft ${result.draftId ?? '(none)'} ` +
          `(beat ${result.beat ?? '-'}, status ${result.status})`,
      )
    },
    { connection },
  )

  inboundWorker.on('failed', (job, err) => {
    console.error(`[setter] worker job ${job?.id ?? 'unknown'} falló:`, err)
  })
}

/** Cierre ordenado de las colas/workers del setter (para shutdown del proceso). */
export async function closeSetterQueues(): Promise<void> {
  if (inboundWorker) {
    await inboundWorker.close()
    inboundWorker = null
  }
  if (inboundQueue) {
    await inboundQueue.close()
    inboundQueue = null
  }
}
