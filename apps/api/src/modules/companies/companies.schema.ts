import { z } from 'zod'

export const CreateCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  ownerId: z.string().min(1).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
})
export type CreateCompanyDTO = z.infer<typeof CreateCompanySchema>

export const UpdateCompanySchema = CreateCompanySchema.partial()
export type UpdateCompanyDTO = z.infer<typeof UpdateCompanySchema>
