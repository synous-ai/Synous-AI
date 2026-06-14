import { z } from 'zod'

export const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  // Roles: owner = acceso total; member = CRM + finanzas; viewer = solo lectura;
  // collaborator = opera el CRM pero sin acceso a finanzas ni administración
  role: z.enum(['owner', 'member', 'viewer', 'collaborator']),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})
export type CreateUserDTO = z.infer<typeof CreateUserSchema>

export const UpdateUserSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(['owner', 'member', 'viewer', 'collaborator']).optional(),
    isActive: z.boolean().optional(),
  })
  .partial()
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>
