import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '../../db'
import { pipeline, pipelineStage, deal } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { CreatePipelineDTO, AddStageDTO, UpdateStageDTO } from './pipelines.schema'

type PipelineRow = typeof pipeline.$inferSelect
type StageRow = typeof pipelineStage.$inferSelect

async function assertPipeline(portalId: string, pipelineId: string): Promise<void> {
  const [pl] = await db
    .select({ id: pipeline.id })
    .from(pipeline)
    .where(and(eq(pipeline.id, pipelineId), eq(pipeline.portalId, portalId)))
    .limit(1)
  if (!pl) throw Errors.notFound('Pipeline no encontrado')
}

export async function addStage(portalId: string, pipelineId: string, input: AddStageDTO): Promise<StageRow> {
  await assertPipeline(portalId, pipelineId)
  const existing = await db.select({ id: pipelineStage.id }).from(pipelineStage).where(eq(pipelineStage.pipelineId, pipelineId))
  const [row] = await db
    .insert(pipelineStage)
    .values({
      pipelineId,
      label: input.label,
      displayOrder: existing.length,
      probability: input.probability === undefined ? null : input.probability.toFixed(4),
      isClosed: input.isClosed ?? false,
      isWon: input.isWon ?? false,
      exitCriteria: input.exitCriteria ?? null,
      description: input.description ?? null,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear la etapa')
  return row
}

export async function deleteStage(portalId: string, pipelineId: string, stageId: string): Promise<void> {
  await assertPipeline(portalId, pipelineId)
  const [used] = await db.select({ n: count() }).from(deal).where(eq(deal.stageId, stageId))
  if ((used?.n ?? 0) > 0) throw Errors.badRequest('La etapa tiene deals; movelos antes de eliminarla')
  const res = await db
    .delete(pipelineStage)
    .where(and(eq(pipelineStage.id, stageId), eq(pipelineStage.pipelineId, pipelineId)))
    .returning({ id: pipelineStage.id })
  if (res.length === 0) throw Errors.notFound('Etapa no encontrada')
}

export async function listPipelines(portalId: string): Promise<Array<PipelineRow & { stages: StageRow[] }>> {
  const pipelines = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.archived, false)))
    .orderBy(asc(pipeline.displayOrder), asc(pipeline.id))

  const result = []
  for (const pl of pipelines) {
    const stages = await db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.pipelineId, pl.id), eq(pipelineStage.archived, false)))
      .orderBy(asc(pipelineStage.displayOrder), asc(pipelineStage.id))
    result.push({ ...pl, stages })
  }
  return result
}

export async function getStages(portalId: string, pipelineId: string): Promise<StageRow[]> {
  const [pl] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.id, pipelineId), eq(pipeline.portalId, portalId)))
    .limit(1)
  if (!pl) throw Errors.notFound('Pipeline no encontrado')
  return db
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, pipelineId), eq(pipelineStage.archived, false)))
    .orderBy(asc(pipelineStage.displayOrder), asc(pipelineStage.id))
}

export async function updateStage(
  portalId: string,
  pipelineId: string,
  stageId: string,
  input: UpdateStageDTO,
): Promise<StageRow> {
  await assertPipeline(portalId, pipelineId)
  const updates: Partial<typeof pipelineStage.$inferInsert> = {}
  if (input.label !== undefined) updates.label = input.label
  if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder
  if (input.isClosed !== undefined) updates.isClosed = input.isClosed
  if (input.isWon !== undefined) updates.isWon = input.isWon
  if ('probability' in input) updates.probability = input.probability === undefined || input.probability === null ? null : input.probability.toFixed(4)
  if ('exitCriteria' in input) updates.exitCriteria = input.exitCriteria ?? null
  if ('description' in input) updates.description = input.description ?? null

  const [row] = await db
    .update(pipelineStage)
    .set(updates)
    .where(and(eq(pipelineStage.id, stageId), eq(pipelineStage.pipelineId, pipelineId)))
    .returning()
  if (!row) throw Errors.notFound('Etapa no encontrada')
  return row
}

export async function createPipeline(portalId: string, input: CreatePipelineDTO): Promise<PipelineRow & { stages: StageRow[] }> {
  return db.transaction(async (tx) => {
    const [pl] = await tx.insert(pipeline).values({ portalId, label: input.label }).returning()
    if (!pl) throw Errors.internal('No se pudo crear el pipeline')

    let stages: StageRow[] = []
    if (input.stages && input.stages.length > 0) {
      stages = await tx
        .insert(pipelineStage)
        .values(
          input.stages.map((s, i) => ({
            pipelineId: pl.id,
            label: s.label,
            displayOrder: s.displayOrder ?? i,
            probability: s.probability === undefined ? null : s.probability.toFixed(4),
            isClosed: s.isClosed ?? false,
            isWon: s.isWon ?? false,
            exitCriteria: s.exitCriteria ?? null,
            description: s.description ?? null,
          })),
        )
        .returning()
    }
    return { ...pl, stages }
  })
}
