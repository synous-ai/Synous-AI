import { z } from 'zod'

export const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'El token de invitación es requerido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})
export type AcceptInviteDTO = z.infer<typeof AcceptInviteSchema>

export const ClientLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})
export type ClientLoginDTO = z.infer<typeof ClientLoginSchema>
