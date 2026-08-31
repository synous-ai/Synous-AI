import { z } from 'zod'

export const CreateProjectUpdateSchema = z.object({
  body: z.string().min(1).max(2000),
  stageId: z.string().min(1).optional(),
})
export type CreateProjectUpdateDTO = z.infer<typeof CreateProjectUpdateSchema>

/** Param `:id` de una novedad de proyecto (project_update), no del deal. */
export const ProjectUpdateIdParamSchema = z.object({
  id: z.string().min(1),
})
