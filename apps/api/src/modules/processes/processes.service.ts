import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db, type DB } from '../../db'
import { processTask, processTemplate } from '../../db/schema'
import { writeAudit, type Tx } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { resetChecklist } from '../../lib/checklist'
import type {
  CreateProcessDTO,
  CreateProcessTaskDTO,
  ListProcessesQuery,
  ReorderProcessTasksDTO,
  UpdateProcessDTO,
  UpdateProcessTaskDTO,
} from './processes.schema'
import type { ProcessDetailDTO, ProcessListItemDTO, ProcessRow, ProcessTaskRow } from './processes.types'

const ENTITY = 'process'
type Executor = DB | Tx

async function requireProcess(executor: Executor, portalId: string, id: string): Promise<ProcessRow> {
  const [row] = await executor
    .select()
    .from(processTemplate)
    .where(and(eq(processTemplate.id, id), eq(processTemplate.portalId, portalId), eq(processTemplate.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Proceso no encontrado')
  return row
}

async function listTasksOf(executor: Executor, processId: string): Promise<ProcessTaskRow[]> {
  return executor
    .select()
    .from(processTask)
    .where(eq(processTask.processId, processId))
    .orderBy(asc(processTask.position), asc(processTask.createdAt), asc(processTask.id))
}

export async function listProcesses(
  portalId: string,
  query: ListProcessesQuery,
): Promise<Paginated<ProcessListItemDTO>> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(processTemplate)
    .where(
      and(
        eq(processTemplate.portalId, portalId),
        eq(processTemplate.archived, false),
        cursor ? cursorWhere(processTemplate.createdAt, processTemplate.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(processTemplate.createdAt), desc(processTemplate.id))
    .limit(query.limit + 1)
  const page = paginateRows(rows, query.limit)

  const counts = new Map<string, number>()
  if (page.items.length > 0) {
    const grouped = await db
      .select({ processId: processTask.processId, count: sql<number>`count(*)::int` })
      .from(processTask)
      .where(inArray(processTask.processId, page.items.map((p) => p.id)))
      .groupBy(processTask.processId)
    for (const g of grouped) counts.set(g.processId, g.count)
  }
  return {
    items: page.items.map((p) => ({ ...p, taskCount: counts.get(p.id) ?? 0 })),
    nextCursor: page.nextCursor,
  }
}

export async function getProcess(portalId: string, id: string): Promise<ProcessDetailDTO> {
  const row = await requireProcess(db, portalId, id)
  return { ...row, tasks: await listTasksOf(db, id) }
}

export async function createProcess(portalId: string, userId: string, input: CreateProcessDTO): Promise<ProcessRow> {
  return db.transaction(async (tx) => {
    // El UNIQUE(portal_id, slug) incluye procesos archivados: el slug no se reutiliza.
    const [dup] = await tx
      .select({ id: processTemplate.id })
      .from(processTemplate)
      .where(and(eq(processTemplate.portalId, portalId), eq(processTemplate.slug, input.slug)))
      .limit(1)
    if (dup) throw Errors.conflict('Ya existe un proceso con ese slug')
    const [row] = await tx
      .insert(processTemplate)
      .values({ portalId, slug: input.slug, name: input.name, description: input.description ?? null })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el proceso')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: 'CREATE', payload: input })
    return row
  })
}

export async function updateProcess(
  portalId: string,
  userId: string,
  id: string,
  input: UpdateProcessDTO,
): Promise<ProcessRow> {
  return db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const [row] = await tx
      .update(processTemplate)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(processTemplate.id, id))
      .returning()
    if (!row) throw Errors.internal('No se pudo actualizar el proceso')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'UPDATE', payload: input })
    return row
  })
}

export async function archiveProcess(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const now = new Date()
    await tx
      .update(processTemplate)
      .set({ archived: true, archivedAt: now, updatedAt: now })
      .where(eq(processTemplate.id, id))
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'ARCHIVE', payload: { archived: true } })
  })
}

// ── Tareas de la plantilla ────────────────────────────────────────────
// process_task es una plantilla, no un dato del CRM: se borra en duro.

export async function createProcessTask(
  portalId: string,
  id: string,
  input: CreateProcessTaskDTO,
): Promise<ProcessTaskRow> {
  return db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const [max] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${processTask.position}), -1)` })
      .from(processTask)
      .where(eq(processTask.processId, id))
    const [row] = await tx
      .insert(processTask)
      .values({
        processId: id,
        title: input.title,
        notes: input.notes ?? null,
        steps: resetChecklist(input.steps ?? []),
        position: Number(max?.max ?? -1) + 1,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear la tarea del proceso')
    return row
  })
}

export async function updateProcessTask(
  portalId: string,
  id: string,
  taskId: string,
  input: UpdateProcessTaskDTO,
): Promise<ProcessTaskRow> {
  return db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const { steps, ...rest } = input
    const [row] = await tx
      .update(processTask)
      .set({ ...rest, ...(steps !== undefined ? { steps: resetChecklist(steps) } : {}), updatedAt: new Date() })
      .where(and(eq(processTask.id, taskId), eq(processTask.processId, id)))
      .returning()
    if (!row) throw Errors.notFound('Tarea del proceso no encontrada')
    return row
  })
}

export async function deleteProcessTask(portalId: string, id: string, taskId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const [row] = await tx
      .delete(processTask)
      .where(and(eq(processTask.id, taskId), eq(processTask.processId, id)))
      .returning({ id: processTask.id })
    if (!row) throw Errors.notFound('Tarea del proceso no encontrada')
  })
}

export async function reorderProcessTasks(
  portalId: string,
  id: string,
  input: ReorderProcessTasksDTO,
): Promise<ProcessTaskRow[]> {
  const ids = input.orderedIds
  if (new Set(ids).size !== ids.length) throw Errors.badRequest('orderedIds contiene ids repetidos')
  return db.transaction(async (tx) => {
    await requireProcess(tx, portalId, id)
    const owned = await tx
      .select({ id: processTask.id })
      .from(processTask)
      .where(and(inArray(processTask.id, ids), eq(processTask.processId, id)))
    if (owned.length !== ids.length) throw Errors.badRequest('Tarea inexistente en este proceso')
    const cases = sql.join(
      ids.map((taskId, i) => sql`WHEN ${taskId} THEN ${i}`),
      sql` `,
    )
    await tx
      .update(processTask)
      .set({ position: sql`CASE ${processTask.id} ${cases} END::int`, updatedAt: new Date() })
      .where(inArray(processTask.id, ids))
    return listTasksOf(tx, id)
  })
}
