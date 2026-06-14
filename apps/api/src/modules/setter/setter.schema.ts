import { z } from 'zod'

/** Estados de un draft en la cola de aprobación. */
export const DraftStatusSchema = z.enum(['pending', 'approved', 'edited', 'rejected', 'sent'])

/** Filtro opcional de la lista de drafts (default: pending). */
export const ListDraftsQuerySchema = z.object({
  status: DraftStatusSchema.default('pending'),
})

/** Body para editar y enviar un draft. */
export const EditDraftSchema = z.object({
  content: z.string().min(1, 'El contenido no puede estar vacío').max(4096),
})

/** Model Switcher: qué LLM genera los mensajes. */
export const ModelProviderSchema = z.object({
  modelProvider: z.enum(['gemini', 'claude']),
})

/** Toggle del autopilot de prospección. */
export const AutopilotSchema = z.object({
  enabled: z.boolean(),
})

/** Query de la Consola (log de eventos del setter). */
export const ListEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(150),
  since: z.string().datetime().optional(),
})

export type ListDraftsQuery = z.infer<typeof ListDraftsQuerySchema>
export type EditDraftInput = z.infer<typeof EditDraftSchema>
export type ModelProviderInput = z.infer<typeof ModelProviderSchema>
