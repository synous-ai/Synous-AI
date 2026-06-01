/**
 * Shared date helpers used across service modules.
 */

/**
 * Returns the start-of-day (midnight 00:00:00.000) in local time.
 */
export function startOfDay(d?: Date): Date {
  const out = new Date(d ?? new Date())
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Returns the end-of-day (23:59:59.999) in local time.
 */
export function endOfDay(d?: Date): Date {
  const out = new Date(d ?? new Date())
  out.setHours(23, 59, 59, 999)
  return out
}
