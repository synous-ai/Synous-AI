import { z } from 'zod'

export const ReportsQuerySchema = z.object({
  from: z
    .string()
    .datetime({ offset: true, message: 'from debe ser ISO 8601' })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  to: z
    .string()
    .datetime({ offset: true, message: 'to debe ser ISO 8601' })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
})

export type ReportsQueryDTO = z.infer<typeof ReportsQuerySchema>
