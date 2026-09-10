import { z } from 'zod'

const ItemSchema = z.object({
  description: z.string().min(1),
  hours: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().positive().optional(),
})

export const CreateCRSchema = z.object({
  dealId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  originalScopeRef: z.string().optional(),
  origin: z.enum(['client', 'agency']).optional(),
  totalAmount: z.number().nonnegative().optional(),
  timelineImpactDays: z.number().int().optional(),
  items: z.array(ItemSchema).optional(),
})
export type CreateCRDTO = z.infer<typeof CreateCRSchema>

export const UpdateCRSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    originalScopeRef: z.string(),
    totalAmount: z.number().nonnegative(),
    timelineImpactDays: z.number().int(),
  })
  .partial()
export type UpdateCRDTO = z.infer<typeof UpdateCRSchema>

export const AddItemSchema = ItemSchema
export type AddItemDTO = z.infer<typeof AddItemSchema>

export const CRListQuerySchema = z.object({ dealId: z.string().min(1).optional() })

const CR_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'negotiating', 'approved_verbally', 'disputed', 'completed'] as const
export const TransitionSchema = z.object({ status: z.enum(CR_STATUSES), comment: z.string().optional() })
export type TransitionDTO = z.infer<typeof TransitionSchema>

export const CommentSchema = z.object({ body: z.string().min(1) })

/**
 * Decisión del cliente sobre una CR (aprobar / rechazar). El comentario es
 * opcional — y el body ENTERO también.
 *
 * El portal aprueba sin comentario, y en ese caso el api-client compartido no
 * manda body ni Content-Type (ver packages/api-client/src/index.ts), con lo
 * que Fastify deja `request.body` en `null`. Un `z.object()` pelado RECHAZA
 * null por más que todas sus props sean opcionales, así que la validación
 * fallaba con 400 antes de llegar al handler: el botón "Aprobar" del portal
 * nunca funcionó. Por eso el `.nullish()`.
 */
export const ClientDecisionSchema = z.object({ comment: z.string().optional() }).nullish()
