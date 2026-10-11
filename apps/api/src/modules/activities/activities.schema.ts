import { z } from 'zod'
import { ListQuerySchema } from '../../lib/crm-schemas'
import { ChecklistStepsSchema } from '../../lib/checklist'

// ── Notas ──────────────────────────────────────────────
export const CreateNoteSchema = z.object({
  body: z.string().min(1),
  dealId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
})
export type CreateNoteDTO = z.infer<typeof CreateNoteSchema>

export const NoteQuerySchema = z.object({
  contactId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
}).merge(ListQuerySchema)
export type NoteQuery = z.infer<typeof NoteQuerySchema>

// ── Tareas ─────────────────────────────────────────────
const taskStatus = z.enum(['pending', 'in_progress', 'in_review', 'completed', 'cancelled'])
const taskPriority = z.enum(['low', 'medium', 'high'])

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  dueDate: z.string().datetime().optional(),
  assignedTo: z.string().min(1).optional(),
  /** Responsables (N:M). Si viene, manda sobre `assignedTo`; el primero queda como responsable primario. */
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
  dealId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  steps: ChecklistStepsSchema.optional(),
})
export type CreateTaskDTO = z.infer<typeof CreateTaskSchema>

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedTo: z.string().min(1).nullable().optional(),
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
  projectId: z.string().min(1).nullable().optional(),
  steps: ChecklistStepsSchema.optional(),
})
export type UpdateTaskDTO = z.infer<typeof UpdateTaskSchema>

export const TaskQuerySchema = z.object({
  status: taskStatus.optional(),
  assignedTo: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
}).merge(ListQuerySchema)
export type TaskQuery = z.infer<typeof TaskQuerySchema>
