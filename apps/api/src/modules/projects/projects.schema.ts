import { z } from 'zod'
import { ListQuerySchema } from '../../lib/crm-schemas'

export const ProjectStatusEnum = z.enum([
  'not_started',
  'in_progress',
  'in_review',
  'waiting_client',
  'on_hold',
  'delivered',
])
export const ProjectStageEnum = z.enum([
  'discovery',
  'design',
  'development',
  'qa',
  'client_review',
  'changes',
  'delivery',
])
export const ProjectPriorityEnum = z.enum(['low', 'medium', 'high'])
export const TaskStatusEnum = z.enum(['pending', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'])

/** 'YYYY-MM-DD' que además es una fecha de calendario real (rechaza 2026-02-31). */
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, 'Fecha inválida')

/** Solo http(s): una URL guardada se renderiza como link, `javascript:` sería XSS. */
const HttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Solo se aceptan URLs http(s)')

const ProcessSlugSchema = z.string().trim().min(1).max(80)

const baseFields = {
  name: z.string().trim().min(1).max(200),
  kind: ProcessSlugSchema.nullable(),
  status: ProjectStatusEnum,
  stage: ProjectStageEnum.nullable(),
  priority: ProjectPriorityEnum,
  dueDate: DateOnlySchema.nullable(),
  repoUrl: HttpUrlSchema.nullable(),
  stagingUrl: HttpUrlSchema.nullable(),
  productionUrl: HttpUrlSchema.nullable(),
  notes: z.string().max(20000).nullable(),
  notesImportant: z.string().max(20000).nullable(),
  companyId: z.string().min(1).nullable(),
  dealId: z.string().min(1).nullable(),
  memberIds: z.array(z.string().min(1)).max(50),
}

const dateOrder = (v: { startDate?: string | null; dueDate?: string | null }): boolean =>
  !v.startDate || !v.dueDate || v.startDate <= v.dueDate
const DATE_ORDER_MSG = { message: 'startDate no puede ser posterior a dueDate', path: ['dueDate'] }

export const CreateProjectSchema = z
  .object({
    name: baseFields.name,
    startDate: DateOnlySchema,
    kind: baseFields.kind.optional(),
    status: baseFields.status.optional(),
    stage: baseFields.stage.optional(),
    priority: baseFields.priority.optional(),
    dueDate: baseFields.dueDate.optional(),
    repoUrl: baseFields.repoUrl.optional(),
    stagingUrl: baseFields.stagingUrl.optional(),
    productionUrl: baseFields.productionUrl.optional(),
    notes: baseFields.notes.optional(),
    notesImportant: baseFields.notesImportant.optional(),
    companyId: baseFields.companyId.optional(),
    dealId: baseFields.dealId.optional(),
    memberIds: baseFields.memberIds.optional(),
  })
  .refine(dateOrder, DATE_ORDER_MSG)
export type CreateProjectDTO = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = z
  .object({
    name: baseFields.name,
    startDate: DateOnlySchema.nullable(),
    kind: baseFields.kind,
    status: baseFields.status,
    stage: baseFields.stage,
    priority: baseFields.priority,
    dueDate: baseFields.dueDate,
    repoUrl: baseFields.repoUrl,
    stagingUrl: baseFields.stagingUrl,
    productionUrl: baseFields.productionUrl,
    notes: baseFields.notes,
    notesImportant: baseFields.notesImportant,
    companyId: baseFields.companyId,
    dealId: baseFields.dealId,
    memberIds: baseFields.memberIds,
  })
  .partial()
  .refine(dateOrder, DATE_ORDER_MSG)
export type UpdateProjectDTO = z.infer<typeof UpdateProjectSchema>

export const ListProjectsQuerySchema = z
  .object({
    status: ProjectStatusEnum.optional(),
    companyId: z.string().min(1).optional(),
    memberId: z.string().min(1).optional(),
    // z.coerce.boolean() trataría 'false' como true.
    includeArchived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .merge(ListQuerySchema)
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>

export const MoveTaskSchema = z.object({
  taskId: z.string().min(1),
  status: TaskStatusEnum,
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
})
export type MoveTaskDTO = z.infer<typeof MoveTaskSchema>
