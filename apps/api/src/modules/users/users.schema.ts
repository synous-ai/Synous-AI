import { z } from 'zod'

export const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(['owner', 'member', 'viewer']),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})
export type CreateUserDTO = z.infer<typeof CreateUserSchema>

export const UpdateUserSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(['owner', 'member', 'viewer']).optional(),
    isActive: z.boolean().optional(),
  })
  .partial()
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>
