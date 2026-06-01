import { and, asc, eq, inArray, lt, lte, gte, isNull, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  task,
  deal,
  pipelineStage,
  contact,
  company,
  call,
  meeting,
  emailSend,
  note,
} from '../../db/schema'
import { startOfDay, endOfDay } from '../../lib/dates'

// ── Return types ──────────────────────────────────────────────────────────────

export interface FollowUpEntity {
  kind: 'deal' | 'contact' | 'company'
  id: string
  label: string
}

export interface FollowUpItem {
  id: string
  title: string
  dueDate: string | null
  priority: 'low' | 'medium' | 'high'
  assignedTo: string | null
  entity: FollowUpEntity | null
}

export interface FollowUpBuckets {
  overdue: FollowUpItem[]
  today: FollowUpItem[]
  upcoming: FollowUpItem[]
}

export interface AttentionDeal {
  id: string
  name: string
  amount: string | null
  stageLabel: string
  ownerId: string | null
  lastActivityAt: string | null
  daysSinceActivity: number | null
}

export interface AttentionData {
  noNextAction: AttentionDeal[]
  stale: AttentionDeal[]
}

export interface FocusData {
  followUps: FollowUpBuckets
  attention: AttentionData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when `date` falls on the same calendar day as `reference`
 * (both already normalised to the server's local timezone via toDateString).
 */
function isSameDay(date: Date, reference: Date): boolean {
  return date.toDateString() === reference.toDateString()
}

// ── getFollowUps ──────────────────────────────────────────────────────────────

/**
 * Returns open tasks (status IN pending/in_progress) bucketed into
 * overdue / today / upcoming (next 7 days), sorted by dueDate asc.
 *
 * When `userId` is provided only tasks assigned to that user are returned.
 */
export async function getFollowUps(
  portalId: string,
  userId?: string,
): Promise<FollowUpBuckets> {
  const now = new Date()
  const todayStart = startOfDay(now)
  const sevenDaysEnd = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))

  // Base conditions: open tasks within the portal
  const baseConds = [
    eq(task.portalId, portalId),
    inArray(task.status, ['pending', 'in_progress']),
    isNotNull(task.dueDate),
    lte(task.dueDate, sevenDaysEnd), // only up to 7 days out
  ]
  if (userId != null) baseConds.push(eq(task.assignedTo, userId))

  const openTasks = await db
    .select()
    .from(task)
    .where(and(...baseConds))
    .orderBy(asc(task.dueDate))

  // Also fetch tasks without a dueDate that are overdue — tasks with dueDate = null
  // are excluded from follow-ups (no due date = not a scheduled follow-up).

  // Collect entity ids for label resolution (avoid N+1)
  const dealIds = [...new Set(openTasks.filter((t) => t.dealId != null).map((t) => t.dealId!))]
  const contactIds = [...new Set(openTasks.filter((t) => t.contactId != null).map((t) => t.contactId!))]
  const companyIds = [...new Set(openTasks.filter((t) => t.companyId != null).map((t) => t.companyId!))]

  const [dealRows, contactRows, companyRows] = await Promise.all([
    dealIds.length
      ? db.select({ id: deal.id, name: deal.name }).from(deal).where(inArray(deal.id, dealIds))
      : Promise.resolve([]),
    contactIds.length
      ? db
          .select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email })
          .from(contact)
          .where(inArray(contact.id, contactIds))
      : Promise.resolve([]),
    companyIds.length
      ? db.select({ id: company.id, name: company.name }).from(company).where(inArray(company.id, companyIds))
      : Promise.resolve([]),
  ])

  const dealLabelMap = new Map(dealRows.map((r) => [r.id, r.name]))
  const contactLabelMap = new Map(
    contactRows.map((r) => [
      r.id,
      [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || `#${r.id}`,
    ]),
  )
  const companyLabelMap = new Map(companyRows.map((r) => [r.id, r.name]))

  function resolveEntity(t: typeof openTasks[number]): FollowUpEntity | null {
    if (t.dealId != null) {
      return { kind: 'deal', id: t.dealId, label: dealLabelMap.get(t.dealId) ?? `Deal #${t.dealId}` }
    }
    if (t.contactId != null) {
      return { kind: 'contact', id: t.contactId, label: contactLabelMap.get(t.contactId) ?? `Contacto #${t.contactId}` }
    }
    if (t.companyId != null) {
      return { kind: 'company', id: t.companyId, label: companyLabelMap.get(t.companyId) ?? `Empresa #${t.companyId}` }
    }
    return null
  }

  const buckets: FollowUpBuckets = { overdue: [], today: [], upcoming: [] }

  for (const t of openTasks) {
    const item: FollowUpItem = {
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      priority: t.priority as FollowUpItem['priority'],
      assignedTo: t.assignedTo,
      entity: resolveEntity(t),
    }

    if (!t.dueDate) continue // guarded above by isNotNull, but be safe

    const due = t.dueDate
    if (due < todayStart) {
      buckets.overdue.push(item)
    } else if (isSameDay(due, now)) {
      buckets.today.push(item)
    } else {
      buckets.upcoming.push(item)
    }
  }

  return buckets
}

// ── getDealsNeedingAttention ──────────────────────────────────────────────────

/**
 * Returns two lists of open deals (stage.isClosed=false, archived=false):
 * - `noNextAction`: deals with NO open tasks
 * - `stale`: deals with no activity in more than 14 days
 *
 * NO N+1: last-activity is computed with one grouped SELECT per table,
 * then merged in JS. nextTask is fetched in one query and assigned in JS.
 */
export async function getDealsNeedingAttention(
  portalId: string,
): Promise<AttentionData> {
  const now = new Date()

  // ── 1. Fetch all open deals with their stage label ───────────────────────
  const openDeals = await db
    .select({
      id: deal.id,
      name: deal.name,
      amount: deal.amount,
      ownerId: deal.ownerId,
      createdAt: deal.createdAt,
      stageLabel: pipelineStage.label,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        eq(deal.portalId, portalId),
        eq(deal.archived, false),
        eq(pipelineStage.isClosed, false),
      ),
    )

  if (openDeals.length === 0) return { noNextAction: [], stale: [] }

  const dealIds = openDeals.map((d) => d.id)

  // ── 2. Open tasks per deal (one query, pick min dueDate in JS) ───────────
  const openTaskRows = await db
    .select({ dealId: task.dealId, id: task.id, dueDate: task.dueDate })
    .from(task)
    .where(
      and(
        eq(task.portalId, portalId),
        inArray(task.status, ['pending', 'in_progress']),
        inArray(task.dealId, dealIds),
      ),
    )

  // Build: dealId -> has open task
  const dealsWithTask = new Set(openTaskRows.map((t) => t.dealId).filter((id): id is string => id != null))

  // ── 3. Last activity per deal — one grouped SELECT per table ─────────────
  const [callAgg, meetingAgg, emailAgg, noteAgg, taskAgg] = await Promise.all([
    // calls: max(occurredAt)
    db
      .select({ dealId: call.dealId, maxDate: sql<string>`max(${call.occurredAt})` })
      .from(call)
      .where(and(eq(call.portalId, portalId), inArray(call.dealId, dealIds)))
      .groupBy(call.dealId),

    // meetings: max(coalesce(starts_at, created_at))
    db
      .select({
        dealId: meeting.dealId,
        maxDate: sql<string>`max(coalesce(${meeting.startsAt}, ${meeting.createdAt}))`,
      })
      .from(meeting)
      .where(and(eq(meeting.portalId, portalId), inArray(meeting.dealId, dealIds)))
      .groupBy(meeting.dealId),

    // emails: max(sentAt)
    db
      .select({ dealId: emailSend.dealId, maxDate: sql<string>`max(${emailSend.sentAt})` })
      .from(emailSend)
      .where(and(eq(emailSend.portalId, portalId), inArray(emailSend.dealId, dealIds)))
      .groupBy(emailSend.dealId),

    // notes: max(createdAt)
    db
      .select({ dealId: note.dealId, maxDate: sql<string>`max(${note.createdAt})` })
      .from(note)
      .where(and(eq(note.portalId, portalId), inArray(note.dealId, dealIds)))
      .groupBy(note.dealId),

    // tasks (any task, completed too): max(completedAt ?? createdAt)
    db
      .select({
        dealId: task.dealId,
        maxDate: sql<string>`max(coalesce(${task.completedAt}, ${task.createdAt}))`,
      })
      .from(task)
      .where(and(eq(task.portalId, portalId), inArray(task.dealId, dealIds)))
      .groupBy(task.dealId),
  ])

  // Merge into dealId -> Date
  const lastActivityMap = new Map<string, Date>()

  function applyAgg(rows: { dealId: string | null; maxDate: string | null }[]): void {
    for (const row of rows) {
      if (!row.dealId || !row.maxDate) continue
      const d = new Date(row.maxDate)
      const existing = lastActivityMap.get(row.dealId)
      if (!existing || d > existing) lastActivityMap.set(row.dealId, d)
    }
  }

  applyAgg(callAgg as { dealId: string | null; maxDate: string | null }[])
  applyAgg(meetingAgg as { dealId: string | null; maxDate: string | null }[])
  applyAgg(emailAgg as { dealId: string | null; maxDate: string | null }[])
  applyAgg(noteAgg as { dealId: string | null; maxDate: string | null }[])
  applyAgg(taskAgg as { dealId: string | null; maxDate: string | null }[])

  // ── 4. Build result lists ────────────────────────────────────────────────
  const STALE_DAYS = 14
  const noNextAction: AttentionDeal[] = []
  const stale: AttentionDeal[] = []

  for (const d of openDeals) {
    const lastActivity = lastActivityMap.get(d.id) ?? null
    const referenceDate = lastActivity ?? d.createdAt
    const msAgo = now.getTime() - referenceDate.getTime()
    const daysAgo = Math.floor(msAgo / (1000 * 60 * 60 * 24))

    const item: AttentionDeal = {
      id: d.id,
      name: d.name,
      amount: d.amount,
      stageLabel: d.stageLabel,
      ownerId: d.ownerId,
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      daysSinceActivity: daysAgo,
    }

    if (!dealsWithTask.has(d.id)) noNextAction.push(item)
    if (daysAgo > STALE_DAYS) stale.push(item)
  }

  return { noNextAction, stale }
}

// ── getFocus ──────────────────────────────────────────────────────────────────

export async function getFocus(portalId: string, userId?: string): Promise<FocusData> {
  const [followUps, attention] = await Promise.all([
    getFollowUps(portalId, userId),
    getDealsNeedingAttention(portalId),
  ])
  return { followUps, attention }
}
