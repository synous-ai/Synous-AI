import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { notificationPref } from '../../db/schema'
import { KNOWN_EVENT_TYPES, type UpsertPrefDTO } from './notification-prefs.schema'

type PrefRow = typeof notificationPref.$inferSelect

/** Default pref values used when a row doesn't exist yet. */
function defaultPref(portalId: string, userId: string, eventType: string): PrefRow {
  return {
    id: '',
    portalId,
    userId,
    eventType,
    inApp: true,
    email: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Returns prefs for every known eventType.
 * If no row exists for a given type, returns in-memory defaults (NOT persisted).
 */
export async function listPrefs(portalId: string, userId: string): Promise<PrefRow[]> {
  const rows = await db
    .select()
    .from(notificationPref)
    .where(and(eq(notificationPref.portalId, portalId), eq(notificationPref.userId, userId)))

  const rowsByType = new Map(rows.map((r) => [r.eventType, r]))

  return KNOWN_EVENT_TYPES.map(
    (et) => rowsByType.get(et) ?? defaultPref(portalId, userId, et),
  )
}

/** Upsert a single preference row. */
export async function upsertPref(
  portalId: string,
  userId: string,
  input: UpsertPrefDTO,
): Promise<PrefRow> {
  const [row] = await db
    .insert(notificationPref)
    .values({
      portalId,
      userId,
      eventType: input.eventType,
      inApp: input.inApp,
      email: input.email,
    })
    .onConflictDoUpdate({
      target: [notificationPref.userId, notificationPref.eventType],
      set: {
        inApp: input.inApp,
        email: input.email,
        updatedAt: new Date(),
      },
    })
    .returning()
  return row!
}
