import { and, eq, gte } from 'drizzle-orm'
import { db } from '../db'
import { portal, notification } from '../db/schema'
import { getFollowUps } from '../modules/focus/focus.service'
import { getDealsNeedingAttention } from '../modules/focus/focus.service'
import { createNotification } from '../modules/notifications/notifications.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns midnight (00:00:00.000) for today in local time. */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Checks whether a notification for the same (portalId, entityType, entityId, type)
 * was already created today (createdAt >= start-of-today).
 * Keeps us idempotent across repeated scans within the same day.
 */
async function notificationExistsToday(
  portalId: string,
  entityType: string,
  entityId: string,
  type: string,
): Promise<boolean> {
  const today = startOfToday()
  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.portalId, portalId),
        eq(notification.entityType, entityType),
        eq(notification.entityId, entityId),
        eq(notification.type, type),
        gte(notification.createdAt, today),
      ),
    )
    .limit(1)
  return rows.length > 0
}

// ── Scan result ───────────────────────────────────────────────────────────────

export interface ReminderScanResult {
  /** Total notifications created across all portals in this run. */
  created: number
}

// ── Main scan ─────────────────────────────────────────────────────────────────

/**
 * Iterates every portal and:
 *   1. Generates `task_due` notifications for overdue + today tasks.
 *   2. Generates `deal_stale` notifications for deals with no activity.
 *
 * Deduplication: a notification is skipped when an identical one
 * (same portalId / entityType / entityId / type) was already created today.
 */
export async function runReminderScan(): Promise<ReminderScanResult> {
  const portals = await db.select({ id: portal.id }).from(portal)

  let created = 0

  for (const p of portals) {
    const portalId = p.id

    // ── 1. Task reminders ────────────────────────────────────────────────────
    const followUps = await getFollowUps(portalId)
    // We only alert on overdue and today — upcoming is not urgent yet.
    const dueTasks = [...followUps.overdue, ...followUps.today]

    for (const item of dueTasks) {
      const isOverdue = followUps.overdue.includes(item)
      const taskTitle = isOverdue
        ? `Tarea vencida: ${item.title}`
        : `Tarea para hoy: ${item.title}`

      // Determine entityType / entityId for both the notification and dedupe.
      // If the task is linked to a deal/contact/company we use that entity;
      // otherwise we fall back to 'task' + the task's own id.
      const entityType: string = item.entity?.kind ?? 'task'
      const entityId: string = item.entity?.id ?? item.id

      const actionUrl = buildTaskActionUrl(item.entity, item.id)

      const alreadySent = await notificationExistsToday(portalId, entityType, entityId, 'task_due')
      if (alreadySent) continue

      await createNotification({
        portalId,
        entityType,
        entityId,
        type: 'task_due',
        title: taskTitle,
        body: item.dueDate ? `Vence: ${new Date(item.dueDate).toLocaleDateString()}` : undefined,
        actionUrl,
      })
      created++
    }

    // ── 2. Deal stale reminders ──────────────────────────────────────────────
    const { stale } = await getDealsNeedingAttention(portalId)

    for (const deal of stale) {
      const days = deal.daysSinceActivity ?? 0
      const alreadySent = await notificationExistsToday(portalId, 'deal', deal.id, 'deal_stale')
      if (alreadySent) continue

      await createNotification({
        portalId,
        entityType: 'deal',
        entityId: deal.id,
        type: 'deal_stale',
        title: `Deal sin actividad hace ${days} días: ${deal.name}`,
        body: deal.stageLabel ? `Etapa: ${deal.stageLabel}` : undefined,
        actionUrl: `/deals/${deal.id}`,
      })
      created++
    }
  }

  return { created }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function buildTaskActionUrl(
  entity: { kind: 'deal' | 'contact' | 'company'; id: string } | null,
  taskId: string,
): string {
  if (!entity) return `/tasks/${taskId}`
  switch (entity.kind) {
    case 'deal':
      return `/deals/${entity.id}`
    case 'contact':
      return `/contacts/${entity.id}`
    case 'company':
      return `/companies/${entity.id}`
  }
}
