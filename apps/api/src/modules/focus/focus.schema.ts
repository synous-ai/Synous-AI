import { z } from 'zod'

export const FocusQuerySchema = z.object({
  mine: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .describe('Si es true, filtra follow-ups asignados al usuario autenticado'),
})

export type FocusQuery = z.infer<typeof FocusQuerySchema>
