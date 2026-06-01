import { and, asc, count, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  call,
  contact,
  deal,
  emailSend,
  hubUser,
  meeting,
  note,
  pipeline,
  pipelineStage,
  task,
} from '../../db/schema'
import { getDealsNeedingAttention } from '../focus/focus.service'
import type { AttentionDeal } from '../focus/focus.service'
import { startOfDay, endOfDay } from '../../lib/dates'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DealsAtRisk {
  count: number
  deals: AttentionDeal[]
}

export interface FunnelStage {
  stageId: string
  label: string
  isWon: boolean
  isClosed: boolean
  currentDeals: number
  currentValue: string
}

export interface PipelineFunnel {
  stages: FunnelStage[]
  winRate: number | null
}

export interface ConversionBySource {
  source: string
  leads: number
  customers: number
  rate: number
}

export interface UserActivity {
  userId: string
  name: string
  calls: number
  meetings: number
  notes: number
  tasksCreated: number
  tasksCompleted: number
}

export interface ClosedWonPeriod {
  count: number
  value: string
}

export interface ClosedWon {
  thisPeriod: ClosedWonPeriod
  previousPeriod: ClosedWonPeriod
}

export interface ReportsData {
  dealsAtRisk: DealsAtRisk
  pipelineFunnel: PipelineFunnel
  conversionBySource: ConversionBySource[]
  activityByUser: UserActivity[]
  closedWon: ClosedWon
}

export interface ReportsParams {
  from?: Date
  to?: Date
}

// ── getReports ─────────────────────────────────────────────────────────────────

export async function getReports(
  portalId: string,
  params?: ReportsParams,
): Promise<ReportsData> {
  const now = new Date()

  // Default period: current calendar month (for closedWon + activity)
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = endOfDay(now)

  const from = params?.from ? startOfDay(params.from) : defaultFrom
  const to = params?.to ? endOfDay(params.to) : defaultTo

  // Previous period: same duration shifted back
  const durationMs = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - durationMs - 1)
  const prevTo = new Date(from.getTime() - 1)

  const [dealsAtRisk, pipelineFunnel, conversionBySource, activityByUser, closedWon] =
    await Promise.all([
      fetchDealsAtRisk(portalId),
      fetchPipelineFunnel(portalId),
      fetchConversionBySource(portalId),
      fetchActivityByUser(portalId, from, to),
      fetchClosedWon(portalId, from, to, prevFrom, prevTo),
    ])

  return { dealsAtRisk, pipelineFunnel, conversionBySource, activityByUser, closedWon }
}

// ── fetchDealsAtRisk ───────────────────────────────────────────────────────────

async function fetchDealsAtRisk(portalId: string): Promise<DealsAtRisk> {
  const attention = await getDealsNeedingAttention(portalId)
  return {
    count: attention.stale.length,
    deals: attention.stale,
  }
}

// ── fetchPipelineFunnel ────────────────────────────────────────────────────────

async function fetchPipelineFunnel(portalId: string): Promise<PipelineFunnel> {
  // Distribution of ACTIVE (non-archived) deals per stage
  const stageRows = await db
    .select({
      stageId: pipelineStage.id,
      label: pipelineStage.label,
      displayOrder: pipelineStage.displayOrder,
      isClosed: pipelineStage.isClosed,
      isWon: pipelineStage.isWon,
      currentDeals: count(deal.id),
      currentValue: sql<string>`coalesce(sum(${deal.amount}), 0)`,
    })
    .from(pipelineStage)
    .innerJoin(
      pipeline,
      and(
        eq(pipelineStage.pipelineId, pipeline.id),
        eq(pipeline.portalId, portalId),
        eq(pipeline.archived, false),
      ),
    )
    .leftJoin(deal, and(eq(deal.stageId, pipelineStage.id), eq(deal.archived, false)))
    .where(eq(pipelineStage.archived, false))
    .groupBy(
      pipelineStage.id,
      pipelineStage.label,
      pipelineStage.displayOrder,
      pipelineStage.isClosed,
      pipelineStage.isWon,
    )
    .orderBy(asc(pipelineStage.displayOrder))

  // Win rate: won deals / all closed deals
  const [winRateRow] = await db
    .select({
      won: sql<number>`count(*) filter (where ${pipelineStage.isWon} = true)`,
      closed: sql<number>`count(*) filter (where ${pipelineStage.isClosed} = true)`,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .innerJoin(
      pipeline,
      and(eq(pipelineStage.pipelineId, pipeline.id), eq(pipeline.portalId, portalId)),
    )
    .where(and(eq(deal.portalId, portalId), eq(deal.archived, false)))

  const won = Number(winRateRow?.won ?? 0)
  const closed = Number(winRateRow?.closed ?? 0)
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : null

  return {
    stages: stageRows.map((r) => ({
      stageId: r.stageId,
      label: r.label,
      isWon: r.isWon,
      isClosed: r.isClosed,
      currentDeals: Number(r.currentDeals),
      currentValue: String(r.currentValue),
    })),
    winRate,
  }
}

// ── fetchConversionBySource ────────────────────────────────────────────────────

async function fetchConversionBySource(portalId: string): Promise<ConversionBySource[]> {
  // Group contacts by source (custom->>'source') and lifecycle_stage
  // One query: count total and customers per source
  const rows = await db
    .select({
      source: sql<string>`coalesce(nullif(trim(${contact.custom}->>'source'), ''), 'Sin fuente')`,
      total: count(),
      customers: sql<number>`count(*) filter (where ${contact.lifecycleStage} = 'customer')`,
    })
    .from(contact)
    .where(and(eq(contact.portalId, portalId), eq(contact.archived, false)))
    .groupBy(sql`coalesce(nullif(trim(${contact.custom}->>'source'), ''), 'Sin fuente')`)
    .orderBy(sql`count(*) desc`)

  return rows.map((r) => {
    const leads = Number(r.total)
    const customers = Number(r.customers)
    return {
      source: r.source,
      leads,
      customers,
      rate: leads > 0 ? Math.round((customers / leads) * 100) : 0,
    }
  })
}

// ── fetchActivityByUser ────────────────────────────────────────────────────────

async function fetchActivityByUser(
  portalId: string,
  from: Date,
  to: Date,
): Promise<UserActivity[]> {
  // Fetch all active users for the portal first
  const users = await db
    .select({
      id: hubUser.id,
      firstName: hubUser.firstName,
      lastName: hubUser.lastName,
      email: hubUser.email,
    })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.isActive, true)))

  if (users.length === 0) return []

  const userIds = users.map((u) => u.id)

  // One grouped query per activity type — no N+1
  const [callRows, meetingRows, noteRows, taskCreatedRows, taskCompletedRows] =
    await Promise.all([
      // calls by createdBy
      db
        .select({ userId: call.createdBy, n: count() })
        .from(call)
        .where(
          and(
            eq(call.portalId, portalId),
            inArray(call.createdBy, userIds),
            gte(call.createdAt, from),
            lte(call.createdAt, to),
          ),
        )
        .groupBy(call.createdBy),

      // meetings by createdBy
      db
        .select({ userId: meeting.createdBy, n: count() })
        .from(meeting)
        .where(
          and(
            eq(meeting.portalId, portalId),
            inArray(meeting.createdBy, userIds),
            gte(meeting.createdAt, from),
            lte(meeting.createdAt, to),
          ),
        )
        .groupBy(meeting.createdBy),

      // notes by createdBy
      db
        .select({ userId: note.createdBy, n: count() })
        .from(note)
        .where(
          and(
            eq(note.portalId, portalId),
            inArray(note.createdBy, userIds),
            gte(note.createdAt, from),
            lte(note.createdAt, to),
          ),
        )
        .groupBy(note.createdBy),

      // tasks created by user
      db
        .select({ userId: task.createdBy, n: count() })
        .from(task)
        .where(
          and(
            eq(task.portalId, portalId),
            inArray(task.createdBy, userIds),
            gte(task.createdAt, from),
            lte(task.createdAt, to),
          ),
        )
        .groupBy(task.createdBy),

      // tasks completed by assignedTo (in period)
      db
        .select({ userId: task.assignedTo, n: count() })
        .from(task)
        .where(
          and(
            eq(task.portalId, portalId),
            inArray(task.assignedTo, userIds),
            eq(task.status, 'completed'),
            gte(task.completedAt, from),
            lte(task.completedAt, to),
          ),
        )
        .groupBy(task.assignedTo),
    ])

  // Build lookup maps: userId -> count
  const callMap = new Map(callRows.map((r) => [r.userId, Number(r.n)]))
  const meetingMap = new Map(meetingRows.map((r) => [r.userId, Number(r.n)]))
  const noteMap = new Map(noteRows.map((r) => [r.userId, Number(r.n)]))
  const taskCreatedMap = new Map(taskCreatedRows.map((r) => [r.userId, Number(r.n)]))
  const taskCompletedMap = new Map(taskCompletedRows.map((r) => [r.userId, Number(r.n)]))

  return users.map((u) => ({
    userId: u.id,
    name:
      [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || `User #${u.id}`,
    calls: callMap.get(u.id) ?? 0,
    meetings: meetingMap.get(u.id) ?? 0,
    notes: noteMap.get(u.id) ?? 0,
    tasksCreated: taskCreatedMap.get(u.id) ?? 0,
    tasksCompleted: taskCompletedMap.get(u.id) ?? 0,
  }))
}

// ── fetchClosedWon ─────────────────────────────────────────────────────────────

async function fetchClosedWon(
  portalId: string,
  from: Date,
  to: Date,
  prevFrom: Date,
  prevTo: Date,
): Promise<ClosedWon> {
  // Deals in a isWon stage, closed within the given period.
  // Uses deal.updatedAt as proxy for close date when closeDate is null.
  async function fetchPeriod(start: Date, end: Date): Promise<ClosedWonPeriod> {
    const [row] = await db
      .select({
        n: count(),
        value: sql<string>`coalesce(sum(${deal.amount}), 0)`,
      })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .innerJoin(
        pipeline,
        and(eq(pipelineStage.pipelineId, pipeline.id), eq(pipeline.portalId, portalId)),
      )
      .where(
        and(
          eq(deal.portalId, portalId),
          eq(pipelineStage.isWon, true),
          gte(sql`coalesce(${deal.closeDate}::timestamptz, ${deal.updatedAt})`, start),
          lte(sql`coalesce(${deal.closeDate}::timestamptz, ${deal.updatedAt})`, end),
        ),
      )
    return { count: Number(row?.n ?? 0), value: String(row?.value ?? '0') }
  }

  const [thisPeriod, previousPeriod] = await Promise.all([
    fetchPeriod(from, to),
    fetchPeriod(prevFrom, prevTo),
  ])

  return { thisPeriod, previousPeriod }
}
