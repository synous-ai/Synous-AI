import { and, eq, gte } from 'drizzle-orm'
import { db } from '../db'
import { portal, notification } from '../db/schema'
import { getFollowUps } from '../modules/focus/focus.service'
import { getDealsNeedingAttention } from '../modules/focus/focus.service'
import { sendDueBookingReminders } from '../modules/calendar/booking-reminders.service'
import { notifyAdmins } from '../modules/notifications/notify'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns midnight (00:00:00.000) for today in local time. */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}


// ── Scan result ───────────────────────────────────────────────────────────────

export interface ReminderScanResult {
  /** Total notifications created across all portals in this run. */
  created: number
  /** Emails de recordatorio de reunión enviados en esta corrida. */
  bookingRemindersSent: number
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

      // El dedupe ya no es un SELECT previo (sujeto a carrera: dos corridas
      // simultáneas leían "no existe" y ambas insertaban) sino la dedupeKey,
      // que absorbe el índice único. La fecha entra en la clave para que el
      // recordatorio vuelva a salir al día siguiente.
      const hoy = new Date().toISOString().slice(0, 10)
      const emitted = await notifyAdmins(portalId, 'task_due', { taskId: entityId, taskTitle }, {
        entity: { type: entityType, id: entityId },
        dedupeKey: `task_due:${entityId}:${hoy}`,
        metadata: { dueDate: item.dueDate ?? null, actionUrl },
      })
      if (emitted) created++
    }

    // ── 2. Deal stale reminders ──────────────────────────────────────────────
    const { stale } = await getDealsNeedingAttention(portalId)

    for (const deal of stale) {
      const days = deal.daysSinceActivity ?? 0
      const hoy = new Date().toISOString().slice(0, 10)
      const emitted = await notifyAdmins(portalId, 'deal_stale', { dealId: deal.id, dealName: deal.name, days }, {
        entity: { type: 'deal', id: deal.id },
        dedupeKey: `deal_stale:${deal.id}:${hoy}`,
        metadata: { stageLabel: deal.stageLabel ?? null },
      })
      if (emitted) created++
    }
  }

  // ── 3. Recordatorios de reunión (24h / 1h antes) ──────────────────────────
  // No es por portal: la query filtra por ventana de tiempo sobre todos los
  // bookings confirmados. Best-effort — si falla, las notificaciones de arriba
  // ya quedaron creadas y el scan no debe darse por perdido.
  let bookingRemindersSent = 0
  try {
    bookingRemindersSent = await sendDueBookingReminders()
  } catch (err) {
    console.error('[reminders] falló el envío de recordatorios de reunión:', err)
  }

  return { created, bookingRemindersSent }
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
