import { z } from 'zod'
import { ListQuerySchema } from '../../lib/crm-schemas'
import { ChecklistStepsSchema } from '../../lib/checklist'

/** kebab-case: es lo que los proyectos guardan en `kind`. */
export const ProcessSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug en kebab-case (a-z, 0-9 y guiones)')

export const CreateProcessSchema = z.object({
  slug: ProcessSlugSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
})
export type CreateProcessDTO = z.infer<typeof CreateProcessSchema>

// El slug no se edita: los proyectos lo referencian en `kind`.
export const UpdateProcessSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable(),
  })
  .partial()
export type UpdateProcessDTO = z.infer<typeof UpdateProcessSchema>

export const ListProcessesQuerySchema = ListQuerySchema
export type ListProcessesQuery = z.infer<typeof ListProcessesQuerySchema>

export const CreateProcessTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(20000).nullable().optional(),
  steps: ChecklistStepsSchema.optional(),
})
export type CreateProcessTaskDTO = z.infer<typeof CreateProcessTaskSchema>

export const UpdateProcessTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(20000).nullable(),
    steps: ChecklistStepsSchema,
  })
  .partial()
export type UpdateProcessTaskDTO = z.infer<typeof UpdateProcessTaskSchema>

export const ProcessTaskParamsSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
})

export const ReorderProcessTasksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
})
export type ReorderProcessTasksDTO = z.infer<typeof ReorderProcessTasksSchema>
