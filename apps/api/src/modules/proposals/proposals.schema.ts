import { z } from 'zod'

/**
 * Schemas Zod del módulo de propuestas. `ProposalContentSchema` valida el
 * contenido editable (el mismo shape que `ProposalContent`), tanto al recibir
 * ediciones del admin como para tipar la respuesta.
 *
 * Cubre SOLO lo que cambia entre clientes: el método, las garantías, el
 * portfolio y el equipo viven en el código de la landing (ver
 * `proposals.types.ts`).
 */

const ProposalScopePhaseSchema = z.object({
  label: z.string().max(40),
  title: z.string().max(160),
  body: z.string().max(1200),
})

const ProposalScopePathSchema = z.object({
  icon: z.enum(['modules', 'versions', 'mobile']),
  title: z.string().max(160),
  body: z.string().max(1200),
})

const ProposalPricingOptionSchema = z.object({
  label: z.string().max(120),
  price: z.string().max(60),
  terms: z.string().max(300),
})

const ProposalInvestmentPhaseSchema = z.object({
  name: z.string().max(200),
  price: z.string().max(60).optional(),
  includes: z.array(z.string().max(300)).max(30),
  payment: z.string().max(300).optional(),
  options: z.array(ProposalPricingOptionSchema).max(6).optional(),
})

const ProposalFaqEntrySchema = z.object({
  question: z.string().max(300),
  answer: z.string().max(2000),
})

export const ProposalContentSchema = z.object({
  // Portada
  clientName: z.string().max(160),
  dateLabel: z.string().max(60),
  heroLede: z.string().max(600),

  // Alcance
  scopeHeading: z.string().max(200),
  scopeLede: z.string().max(1000),
  scopePhases: z.array(ProposalScopePhaseSchema).max(8),
  scopePaths: z.array(ProposalScopePathSchema).max(4).optional(),

  // Inversión
  investmentHeading: z.string().max(200),
  investmentPhases: z.array(ProposalInvestmentPhaseSchema).max(8),
  investmentNote: z.string().max(1000).optional(),

  // Información importante
  termsNote: z.string().max(1000),
  exclusions: z.array(z.string().max(400)).max(20),

  // Preguntas propias de este proyecto
  extraFaq: z.array(ProposalFaqEntrySchema).max(10).optional(),
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
