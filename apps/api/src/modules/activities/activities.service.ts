import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db, type DB } from '../../db'
import { hubUser, note, task, taskAssignee } from '../../db/schema'
import { writeAudit, type Tx } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { assertHubUsersInPortal, assertProjectInPortal } from '../../lib/portal-access'
import { normalizeChecklist } from '../../lib/checklist'
import type { CreateNoteDTO, NoteQuery, CreateTaskDTO, UpdateTaskDTO, TaskQuery } from './activities.schema'

type NoteRow = typeof note.$inferSelect
type TaskRow = typeof task.$inferSelect

// ── Notas ──────────────────────────────────────────────
export async function createNote(portalId: string, userId: string, input: CreateNoteDTO): Promise<NoteRow> {
  const [row] = await db.insert(note).values({ ...input, portalId, createdBy: userId }).returning()
  if (!row) throw Errors.internal('No se pudo crear la nota')
  return row
}

export async function listNotes(portalId: string, filters: NoteQuery): Promise<Paginated<NoteRow>> {
  const conds: SQL[] = [eq(note.portalId, portalId), eq(note.archived, false)]
  if (filters.contactId) conds.push(eq(note.contactId, filters.contactId))
  if (filters.dealId) conds.push(eq(note.dealId, filters.dealId))
  if (filters.companyId) conds.push(eq(note.companyId, filters.companyId))
  const cursor = decodeCursor(filters.cursor)
  const rows = await db
    .select()
    .from(note)
    .where(and(...conds, cursor ? cursorWhere(note.createdAt, note.id, cursor) : undefined))
    .orderBy(desc(note.createdAt), desc(note.id))
    .limit(filters.limit + 1)
  return paginateRows(rows, filters.limit)
}

export async function archiveNote(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(note)
      .set({ archived: true, archivedAt: new Date() })
      .where(and(eq(note.portalId, portalId), eq(note.id, id), eq(note.archived, false)))
      .returning({ id: note.id })
    if (!row) throw Errors.notFound('Nota no encontrada')
    await writeAudit({ tx, portalId, userId, entityType: 'note', entityId: id, action: 'ARCHIVE', payload: { archived: true } })
  })
}

// ── Tareas ─────────────────────────────────────────────
export interface TaskAssigneeDTO {
  id: string
  firstName: string | null
  lastName: string | null
}
export type TaskWithAssignees = TaskRow & { assignees: TaskAssigneeDTO[] }

type Executor = DB | Tx

/** Responsables de un conjunto de tareas, agrupados por taskId (una sola query). */
export async function loadTaskAssignees(
  executor: Executor,
  taskIds: readonly string[],
): Promise<Map<string, TaskAssigneeDTO[]>> {
  const map = new Map<string, TaskAssigneeDTO[]>()
  if (taskIds.length === 0) return map
  const rows = await executor
    .select({
      taskId: taskAssignee.taskId,
      id: hubUser.id,
      firstName: hubUser.firstName,
      lastName: hubUser.lastName,
    })
    .from(taskAssignee)
    .innerJoin(hubUser, eq(hubUser.id, taskAssignee.hubUserId))
    .where(inArray(taskAssignee.taskId, [...taskIds]))
    .orderBy(asc(hubUser.firstName), asc(hubUser.id))
  for (const r of rows) {
    const list = map.get(r.taskId) ?? []
    list.push({ id: r.id, firstName: r.firstName, lastName: r.lastName })
    map.set(r.taskId, list)
  }
  return map
}

export async function withAssignees(executor: Executor, rows: TaskRow[]): Promise<TaskWithAssignees[]> {
  const map = await loadTaskAssignees(executor, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, assignees: map.get(r.id) ?? [] }))
}

/** Reemplaza el set de responsables de la tarea (task_assignee). El caller valida los ids contra el portal. */
export async function syncTaskAssignees(tx: Tx, taskId: string, userIds: readonly string[]): Promise<void> {
  await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, taskId))
  if (userIds.length > 0) {
    await tx.insert(taskAssignee).values(userIds.map((hubUserId) => ({ taskId, hubUserId })))
  }
}

/** Siguiente posición libre al final de una columna (project, status) del kanban. */
async function nextPosition(tx: Tx, projectId: string, status: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`COALESCE(MAX(${task.position}), -1)` })
    .from(task)
    .where(and(eq(task.projectId, projectId), eq(task.status, status), eq(task.archived, false)))
  return Number(row?.max ?? -1) + 1
}

/**
 * Resuelve el set de responsables pedido. `assigneeIds` manda sobre `assignedTo`
 * (compat: un request viejo con solo `assignedTo` equivale a `[assignedTo]`).
 * Devuelve `undefined` si el request no toca los responsables.
 */
function resolveAssignees(input: {
  assigneeIds?: string[]
  assignedTo?: string | null
}): string[] | undefined {
  if (input.assigneeIds !== undefined) return [...new Set(input.assigneeIds)]
  if (input.assignedTo !== undefined) return input.assignedTo ? [input.assignedTo] : []
  return undefined
}

export async function createTask(portalId: string, userId: string, input: CreateTaskDTO): Promise<TaskWithAssignees> {
  const { dueDate, assigneeIds: _ids, steps, ...rest } = input
  const assignees = resolveAssignees(input) ?? []
  return db.transaction(async (tx) => {
    await assertProjectInPortal(portalId, input.projectId, tx)
    await assertHubUsersInPortal(portalId, assignees, tx)
    const status = input.status ?? 'pending'
    const position = input.projectId ? await nextPosition(tx, input.projectId, status) : 0
    const [row] = await tx
      .insert(task)
      .values({
        ...rest,
        portalId,
        createdBy: userId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        // Dual-write: assigned_to = responsable primario (el primero).
        assignedTo: assignees[0] ?? null,
        steps: normalizeChecklist(steps ?? []),
        position,
        completedAt: status === 'completed' ? new Date() : undefined,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear la tarea')
    await syncTaskAssignees(tx, row.id, assignees)
    return (await withAssignees(tx, [row]))[0]!
  })
}

export async function listTasks(portalId: string, filters: TaskQuery): Promise<Paginated<TaskWithAssignees>> {
  const conds: SQL[] = [eq(task.portalId, portalId), eq(task.archived, false)]
  if (filters.status) conds.push(eq(task.status, filters.status))
  if (filters.assignedTo) conds.push(eq(task.assignedTo, filters.assignedTo))
  if (filters.contactId) conds.push(eq(task.contactId, filters.contactId))
  if (filters.dealId) conds.push(eq(task.dealId, filters.dealId))
  if (filters.projectId) conds.push(eq(task.projectId, filters.projectId))
  const cursor = decodeCursor(filters.cursor)
  const rows = await db
    .select()
    .from(task)
    .where(and(...conds, cursor ? cursorWhere(task.createdAt, task.id, cursor) : undefined))
    .orderBy(desc(task.createdAt), desc(task.id))
    .limit(filters.limit + 1)
  const page = paginateRows(rows, filters.limit)
  return { items: await withAssignees(db, page.items), nextCursor: page.nextCursor }
}

export async function updateTask(portalId: string, id: string, input: UpdateTaskDTO): Promise<TaskWithAssignees> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(task)
      .where(and(eq(task.portalId, portalId), eq(task.id, id), eq(task.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Tarea no encontrada')

    const assignees = resolveAssignees(input)
    await assertProjectInPortal(portalId, input.projectId, tx)
    if (assignees) await assertHubUsersInPortal(portalId, assignees, tx)

    const patch: Partial<typeof task.$inferInsert> = { updatedAt: new Date() }
    if (input.title !== undefined) patch.title = input.title
    if (input.body !== undefined) patch.body = input.body
    if (input.priority !== undefined) patch.priority = input.priority
    if (assignees !== undefined) patch.assignedTo = assignees[0] ?? null
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null
    if (input.steps !== undefined) patch.steps = normalizeChecklist(input.steps)
    if (input.projectId !== undefined) {
      patch.projectId = input.projectId
      // Cambiar de proyecto manda la tarea al final de la columna de destino.
      if (input.projectId && input.projectId !== existing.projectId) {
        patch.position = await nextPosition(tx, input.projectId, input.status ?? existing.status)
      }
    }
    if (input.status !== undefined) {
      patch.status = input.status
      // sincroniza completedAt con el estado
      if (input.status === 'completed') patch.completedAt = existing.completedAt ?? new Date()
      else patch.completedAt = null
      // Pasar de columna sin cambiar de proyecto: al final de la columna nueva.
      if (input.status !== existing.status && existing.projectId && patch.position === undefined) {
        patch.position = await nextPosition(tx, existing.projectId, input.status)
      }
    }

    const [row] = await tx.update(task).set(patch).where(eq(task.id, id)).returning()
    if (!row) throw Errors.internal('No se pudo actualizar la tarea')
    if (assignees !== undefined) await syncTaskAssignees(tx, id, assignees)
    return (await withAssignees(tx, [row]))[0]!
  })
}

export async function archiveTask(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(task)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(task.portalId, portalId), eq(task.id, id), eq(task.archived, false)))
      .returning({ id: task.id })
    if (!row) throw Errors.notFound('Tarea no encontrada')
    await writeAudit({ tx, portalId, userId, entityType: 'task', entityId: id, action: 'ARCHIVE', payload: { archived: true } })
  })
}
