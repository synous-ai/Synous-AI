/**
 * Contenido estructurado de una propuesta comercial.
 *
 * Cada bloque mapea a una "slide" de la presentación pública. La IA lo genera a
 * partir del onboarding + deal + contacto; el admin lo puede editar antes de
 * aceptarlo. Es la única fuente de verdad del contenido (se guarda en
 * `proposal.content` como jsonb).
 */
export interface ProposalContent {
  // Portada
  title: string // ej. "Propuesta — CRM a medida para Acme"
  clientName: string // nombre del contacto
  companyName?: string // empresa/marca, si la informó
  logoUrl?: string // logo del cliente/empresa (ruta /api/files/… o URL absoluta)
  tagline?: string // una línea de gancho bajo el título

  // Resumen ejecutivo (1 párrafo)
  summary: string

  // Entendimiento de su situación (lo que captamos del onboarding)
  understanding: string

  // Objetivos del proyecto (bullets)
  objectives: string[]

  // Solución propuesta (qué vamos a construir, 1-2 párrafos)
  solution: string

  // Alcance / entregables concretos
  scope: ProposalScopeItem[]

  // Fases del proyecto (timeline)
  timeline: ProposalPhase[]

  // Inversión
  pricing: ProposalPricing

  // Por qué NOUS (diferenciales, bullets)
  whyUs: string[]

  // Próximos pasos (cierre / call to action)
  nextSteps: string

  // Términos y condiciones (opcional)
  terms?: string
}

export interface ProposalScopeItem {
  title: string
  description: string
}

export interface ProposalPhase {
  phase: string // ej. "Fase 1 — Descubrimiento"
  duration: string // ej. "1 semana"
  detail: string
}

export interface ProposalPricing {
  items: ProposalPricingItem[]
  total: number
  currency: string // ISO 4217, ej. "USD"
  note?: string // ej. "50% al inicio, 50% a la entrega"
}

export interface ProposalPricingItem {
  label: string
  amount: number
}

/** Estados del ciclo de vida de una propuesta. */
export type ProposalStatus = 'draft' | 'accepted' | 'sent' | 'viewed'
