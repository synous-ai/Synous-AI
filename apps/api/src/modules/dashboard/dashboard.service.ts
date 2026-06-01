import { and, asc, count, desc, eq, inArray, notInArray, sql, sum } from 'drizzle-orm'
import { db } from '../../db'
import { contact, company, deal, task, pipeline, pipelineStage } from '../../db/schema'
import { LEAD_STAGES } from '../leads/leads.service'

export interface DashboardData {
  counts: { leads: number; clients: number; companies: number; openTasks: number }
  pipeline: { openDeals: number; openValue: string; weightedForecast: string }
  dealsByStage: { stageId: string; label: string; deals: number; value: string }[]
  recentTasks: (typeof task.$inferSelect)[]
  recentDeals: (typeof deal.$inferSelect)[]
}

const OPEN_TASK_STATUSES = ['completed', 'cancelled'] // se EXCLUYEN

export async function getDashboard(portalId: string): Promise<DashboardData> {
  const [
    [leadsRow],
    [clientsRow],
    [companiesRow],
    [tasksRow],
    [dealAgg],
    [forecastRow],
    dealsByStage,
    recentTasks,
    recentDeals,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.archived, false), inArray(contact.lifecycleStage, LEAD_STAGES))),

    db
      .select({ n: count() })
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.archived, false), eq(contact.lifecycleStage, 'customer'))),

    db
      .select({ n: count() })
      .from(company)
      .where(and(eq(company.portalId, portalId), eq(company.archived, false))),

    db
      .select({ n: count() })
      .from(task)
      .where(and(eq(task.portalId, portalId), notInArray(task.status, OPEN_TASK_STATUSES))),

    db
      .select({ openDeals: count(), openValue: sql<string>`coalesce(sum(${deal.amount}), 0)` })
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.archived, false))),

    db
      .select({
        weighted: sql<string>`coalesce(sum(${deal.amount} * coalesce(${pipelineStage.probability}, 0)), 0)`,
      })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .where(and(eq(deal.portalId, portalId), eq(deal.archived, false))),

    db
      .select({
        stageId: pipelineStage.id,
        label: pipelineStage.label,
        deals: count(deal.id),
        value: sql<string>`coalesce(sum(${deal.amount}), 0)`,
      })
      .from(pipelineStage)
      .innerJoin(
        pipeline,
        and(eq(pipelineStage.pipelineId, pipeline.id), eq(pipeline.portalId, portalId), eq(pipeline.archived, false)),
      )
      .leftJoin(deal, and(eq(deal.stageId, pipelineStage.id), eq(deal.archived, false)))
      .groupBy(pipelineStage.id, pipelineStage.label, pipelineStage.displayOrder)
      .orderBy(asc(pipelineStage.displayOrder)),

    db
      .select()
      .from(task)
      .where(and(eq(task.portalId, portalId), notInArray(task.status, OPEN_TASK_STATUSES)))
      .orderBy(asc(task.dueDate), desc(task.createdAt))
      .limit(6),

    db
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.archived, false)))
      .orderBy(desc(deal.createdAt))
      .limit(6),
  ])

  return {
    counts: {
      leads: leadsRow?.n ?? 0,
      clients: clientsRow?.n ?? 0,
      companies: companiesRow?.n ?? 0,
      openTasks: tasksRow?.n ?? 0,
    },
    pipeline: {
      openDeals: dealAgg?.openDeals ?? 0,
      openValue: dealAgg?.openValue ?? '0',
      weightedForecast: forecastRow?.weighted ?? '0',
    },
    dealsByStage,
    recentTasks,
    recentDeals,
  }
}
