import { Queue, Worker } from 'bullmq'
import { getRedisConnectionOptions } from './connection'
import { runReminderScan } from './reminders.service'

const QUEUE_NAME = 'reminders'
const JOB_ID = 'scan'
/** 15 minutes in milliseconds */
const REPEAT_EVERY_MS = 15 * 60 * 1000

// Module-level references so we can close them on shutdown.
let queue: Queue | null = null
let worker: Worker | null = null

/**
 * Bootstraps the reminders queue:
 *   - Creates (or reuses) the BullMQ Queue.
 *   - Upserts a repeatable job that fires every 15 minutes.
 *   - Starts a Worker that calls `runReminderScan()` on each tick.
 *
 * BullMQ creates its own ioredis connections internally from the options object,
 * so we avoid passing pre-built Redis instances (which would cause ioredis
 * version conflicts in the TypeScript type system).
 */
export async function setupReminders(): Promise<void> {
  const connection = getRedisConnectionOptions()

  queue = new Queue(QUEUE_NAME, { connection })

  // Upsert the repeatable job — `jobId` is stable so repeated calls are
  // idempotent (no duplicate schedulers accumulate across server restarts).
  await queue.upsertJobScheduler(JOB_ID, { every: REPEAT_EVERY_MS })

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      console.log('[reminders] scan iniciado')
      const result = await runReminderScan()
      console.log(`[reminders] scan completado — notificaciones creadas: ${result.created}`)
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[reminders] job ${job?.id ?? 'unknown'} falló:`, err)
  })
}

/**
 * Closes the worker and queue connections in the correct order.
 * Call this during the process shutdown sequence.
 */
export async function closeReminders(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  if (queue) {
    await queue.close()
    queue = null
  }
}
