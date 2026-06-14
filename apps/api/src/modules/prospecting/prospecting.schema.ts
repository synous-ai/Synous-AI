import { z } from 'zod'

/** Body de POST /api/prospecting/search — dispara el pipeline de prospección. */
export const RunSearchSchema = z.object({
  query: z.string().min(3, 'La búsqueda debe tener al menos 3 caracteres').max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  ourServices: z.string().max(500).optional(),
})
export type RunSearchDTO = z.infer<typeof RunSearchSchema>

/** Listado de búsquedas (paginado por cursor). */
export const ListSearchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})
export type ListSearchesQueryDTO = z.infer<typeof ListSearchesQuerySchema>

/** Body de POST /api/prospecting/suggest-services — redacta el perfil de servicios. */
export const SuggestServicesSchema = z.object({
  hint: z.string().max(500).optional().default(''),
})
export type SuggestServicesDTO = z.infer<typeof SuggestServicesSchema>

/** Listado de prospectos, filtrable por búsqueda y estado. */
export const ListProspectsQuerySchema = z.object({
  searchId: z.string().min(1).optional(),
  status: z.enum(['new', 'imported', 'discarded']).optional(),
})
export type ListProspectsQueryDTO = z.infer<typeof ListProspectsQuerySchema>
