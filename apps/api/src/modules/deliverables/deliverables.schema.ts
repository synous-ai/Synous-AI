import { z } from 'zod'

export const DeliverableTypeEnum = z.enum(['design', 'prototype', 'staging', 'final'])
export const DeliverableStatusEnum = z.enum(['pending_review', 'approved', 'changes_requested'])

export const CreateDeliverableSchema = z.object({
  dealId: z.string().min(1),
  title: z.string().min(1),
  type: DeliverableTypeEnum,
  url: z.string().url().optional(),
  description: z.string().optional(),
  /**
   * ¿Se muestra en el Portal del cliente? Default true — un entregable se
   * entrega. Se manda false para material interno del proceso (Blueprint
   * técnico, Diagnóstico), que el cliente no debe ver.
   */
  visibleToClient: z.boolean().optional(),
})
export type CreateDeliverableDTO = z.infer<typeof CreateDeliverableSchema>

export const UpdateDeliverableSchema = z
  .object({
    title: z.string().min(1),
    url: z.string().url(),
    description: z.string(),
    status: DeliverableStatusEnum,
    feedback: z.string(),
    visibleToClient: z.boolean(),
  })
  .partial()
export type UpdateDeliverableDTO = z.infer<typeof UpdateDeliverableSchema>

export const DeliverableListQuerySchema = z.object({
  dealId: z.string().min(1).optional(),
})
export type DeliverableListQueryType = z.infer<typeof DeliverableListQuerySchema>
