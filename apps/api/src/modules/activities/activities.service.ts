import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '../../db'
import { note, task } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { CreateNoteDTO, NoteQuery, CreateTaskDTO, UpdateTaskDTO, TaskQuery } from './activities.schema'

type NoteRow = typeof note.$inferSelect
type TaskRow = typeof task.$inferSelect

// ── Notas ──────────────────────────────────────────────
export async function createNote(portalId: string, userId: string, input: CreateNoteDTO): Promise<NoteRow> {
  const [row] = await db.insert(note).values({ ...input, portalId, createdBy: userId }).returning()
  if (!row) throw Errors.internal('No se pudo crear la nota')
  return row
}

export async function listNotes(portalId: string, filters: NoteQuery): Promise<NoteRow[]> {
  const conds: SQL[] = [eq(note.portalId, portalId)]
  if (filters.contactId) conds.push(eq(note.contactId, filters.contactId))
  if (filters.dealId) conds.push(eq(note.dealId, filters.dealId))
  if (filters.companyId) conds.push(eq(note.companyId, filters.companyId))
  return db.select().from(note).where(and(...conds)).orderBy(desc(note.createdAt)).limit(100)
}

export async function deleteNote(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(note)
    .where(and(eq(note.portalId, portalId), eq(note.id, id)))
    .returning({ id: note.id })
  if (res.length === 0) throw Errors.notFound('Nota no encontrada')
}

// ── Tareas ─────────────────────────────────────────────
export async function createTask(portalId: string, userId: string, input: CreateTaskDTO): Promise<TaskRow> {
  const { dueDate, ...rest } = input
  const [row] = await db
    .insert(task)
    .values({ ...rest, portalId, createdBy: userId, dueDate: dueDate ? new Date(dueDate) : undefined })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear la tarea')
  return row
}

export async function listTasks(portalId: string, filters: TaskQuery): Promise<TaskRow[]> {
  const conds: SQL[] = [eq(task.portalId, portalId)]
  if (filters.status) conds.push(eq(task.status, filters.status))
  if (filters.assignedTo) conds.push(eq(task.assignedTo, filters.assignedTo))
  if (filters.contactId) conds.push(eq(task.contactId, filters.contactId))
  if (filters.dealId) conds.push(eq(task.dealId, filters.dealId))
  return db.select().from(task).where(and(...conds)).orderBy(desc(task.createdAt)).limit(200)
}

export async function updateTask(portalId: string, id: string, input: UpdateTaskDTO): Promise<TaskRow> {
  const [existing] = await db
    .select()
    .from(task)
    .where(and(eq(task.portalId, portalId), eq(task.id, id)))
    .limit(1)
  if (!existing) throw Errors.notFound('Tarea no encontrada')

  const patch: Partial<typeof task.$inferInsert> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.status !== undefined) {
    patch.status = input.status
    // sincroniza completedAt con el estado
    if (input.status === 'completed') patch.completedAt = existing.completedAt ?? new Date()
    else patch.completedAt = null
  }

  const [row] = await db.update(task).set(patch).where(eq(task.id, id)).returning()
  if (!row) throw Errors.internal('No se pudo actualizar la tarea')
  return row
}

export async function deleteTask(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(task)
    .where(and(eq(task.portalId, portalId), eq(task.id, id)))
    .returning({ id: task.id })
  if (res.length === 0) throw Errors.notFound('Tarea no encontrada')
}
