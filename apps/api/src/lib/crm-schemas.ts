import { z } from 'zod'

/** Query de listado paginado por cursor. */
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})
export type ListQuery = z.infer<typeof ListQuerySchema>

/** Param `:id` — CUID2 string. */
export const IdParamSchema = z.object({
  id: z.string().min(1),
})
