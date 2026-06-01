import { z } from 'zod'

export const CreateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  companyId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  lifecycleStage: z.enum(['lead', 'mql', 'sql', 'opportunity', 'customer', 'other']).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
})
export type CreateContactDTO = z.infer<typeof CreateContactSchema>

export const UpdateContactSchema = CreateContactSchema.partial()
export type UpdateContactDTO = z.infer<typeof UpdateContactSchema>
