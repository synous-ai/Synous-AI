import type { ConnectionOptions } from 'bullmq'
import { env } from '../config/env'

/**
 * Returns true when REDIS_URL is present in the environment.
 * Used as a guard before bootstrapping the reminders worker.
 */
export function isRedisConfigured(): boolean {
  return !!env.REDIS_URL
}

/**
 * Returns BullMQ-compatible connection options derived from REDIS_URL.
 *
 * We pass a plain `ConnectionOptions` object (host / port / password) instead
 * of a pre-built ioredis instance. This avoids a TypeScript structural
 * mismatch that occurs when the root `ioredis` version differs from the one
 * bundled inside `bullmq`.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ so that commands are
 * retried indefinitely by the queue-level retry logic instead of failing fast.
 *
 * Only call this when `isRedisConfigured()` is true.
 */
export function getRedisConnectionOptions(): ConnectionOptions {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured — cannot build Redis connection options')
  }

  const url = new URL(env.REDIS_URL)

  const options: ConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    // maxRetriesPerRequest must be null for BullMQ (required by the library)
    maxRetriesPerRequest: null,
  }

  if (url.password) {
    ;(options as Record<string, unknown>)['password'] = decodeURIComponent(url.password)
  }
  if (url.username) {
    ;(options as Record<string, unknown>)['username'] = decodeURIComponent(url.username)
  }

  return options
}
