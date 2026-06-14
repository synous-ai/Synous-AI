import { z } from 'zod'

/**
 * Schemas Zod del módulo de propuestas. `ProposalContentSchema` valida el
 * contenido editable (el mismo shape que `ProposalContent`), tanto al recibir
 * ediciones del admin como para tipar la respuesta.
 */

const ProposalScopeItemSchema = z.object({
  title: z.string().max(160),
  description: z.string().max(1000),
})

const ProposalPhaseSchema = z.object({
  phase: z.string().max(160),
  duration: z.string().max(80),
  detail: z.string().max(1000),
})

const ProposalPricingItemSchema = z.object({
  label: z.string().max(200),
  amount: z.number().nonnegative(),
})

const ProposalPricingSchema = z.object({
  items: z.array(ProposalPricingItemSchema).max(30),
  total: z.number().nonnegative(),
  currency: z.string().min(1).max(3),
  note: z.string().max(400).optional(),
})

export const ProposalContentSchema = z.object({
  title: z.string().max(200),
  clientName: z.string().max(160),
  companyName: z.string().max(160).optional(),
  logoUrl: z.string().max(500).optional(),
  tagline: z.string().max(200).optional(),
  summary: z.string().max(2000),
  understanding: z.string().max(2000),
  objectives: z.array(z.string().max(400)).max(12),
  solution: z.string().max(3000),
  scope: z.array(ProposalScopeItemSchema).max(20),
  timeline: z.array(ProposalPhaseSchema).max(12),
  pricing: ProposalPricingSchema,
  whyUs: z.array(z.string().max(400)).max(10),
  nextSteps: z.string().max(2000),
  terms: z.string().max(3000).optional(),
})

/** Body para generar una propuesta a partir de un deal. */
export const GenerateProposalSchema = z.object({
  dealId: z.string().min(1, 'dealId requerido').max(60),
})
export type GenerateProposalDTO = z.infer<typeof GenerateProposalSchema>

/** Body para editar una propuesta (título y/o contenido). */
export const UpdateProposalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: ProposalContentSchema.optional(),
})
export type UpdateProposalDTO = z.infer<typeof UpdateProposalSchema>

/** Param del token público del link `/p/<token>`. */
export const ProposalTokenParamSchema = z.object({
  token: z.string().min(1).max(60),
})
