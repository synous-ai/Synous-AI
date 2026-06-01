import { z } from 'zod'

export const CreateDealSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  closeDate: z.string().date().optional(), // YYYY-MM-DD
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  primaryContactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
})
export type CreateDealDTO = z.infer<typeof CreateDealSchema>

// El pipeline/stage NO se cambian por el update genérico — se usa /stage.
export const UpdateDealSchema = z
  .object({
    name: z.string().min(1),
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
    closeDate: z.string().date(),
    primaryContactId: z.string().min(1),
    companyId: z.string().min(1),
    ownerId: z.string().min(1),
    custom: z.record(z.string(), z.unknown()),
  })
  .partial()
export type UpdateDealDTO = z.infer<typeof UpdateDealSchema>

export const ChangeStageSchema = z.object({
  stageId: z.string().min(1),
})
export type ChangeStageDTO = z.infer<typeof ChangeStageSchema>

export const AddDealContactSchema = z.object({
  contactId: z.string().min(1),
  role: z.string().optional(),
})
export type AddDealContactDTO = z.infer<typeof AddDealContactSchema>

export const DealContactParamSchema = z.object({
  id: z.string().min(1),
  contactId: z.string().min(1),
})
