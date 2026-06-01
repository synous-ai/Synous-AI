import { z } from 'zod'

const StageInputSchema = z.object({
  label: z.string().min(1),
  displayOrder: z.number().int().min(0).optional(),
  probability: z.number().min(0).max(1).optional(),
  isClosed: z.boolean().optional(),
  isWon: z.boolean().optional(),
  exitCriteria: z.string().optional(),
  description: z.string().optional(),
})

export const CreatePipelineSchema = z.object({
  label: z.string().min(1),
  stages: z.array(StageInputSchema).min(1).optional(),
})
export type CreatePipelineDTO = z.infer<typeof CreatePipelineSchema>

export const AddStageSchema = StageInputSchema
export type AddStageDTO = z.infer<typeof AddStageSchema>

export const UpdateStageSchema = z.object({
  label: z.string().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
  probability: z.number().min(0).max(1).optional().nullable(),
  isClosed: z.boolean().optional(),
  isWon: z.boolean().optional(),
  exitCriteria: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
})
export type UpdateStageDTO = z.infer<typeof UpdateStageSchema>
