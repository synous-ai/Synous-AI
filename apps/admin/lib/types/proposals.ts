// Tipos de propuestas — espejo de apps/api/src/modules/proposals/proposals.types.ts.
// Mantener en sync con el backend (mismo shape de ProposalContent).
//
// `ProposalContent` cubre SOLO lo que cambia entre clientes. El método, las
// garantías, el portfolio y el equipo son fijos y viven en el código de la
// landing pública.

export interface ProposalScopePhase {
  /** Etiqueta corta: "FASE 01". */
  label: string
  title: string
  body: string
}

export interface ProposalScopePath {
  icon: 'modules' | 'versions' | 'mobile'
  title: string
  body: string
}

export interface ProposalPricingOption {
  label: string
  price: string
  terms: string
}

export interface ProposalInvestmentPhase {
  name: string
  /** Precio único. Se omite cuando la fase ofrece varias formas de pago. */
  price?: string
  includes: string[]
  payment?: string
  options?: ProposalPricingOption[]
}

export interface ProposalFaqEntry {
  question: string
  answer: string
}

export interface ProposalContent {
  // Portada
  clientName: string
  dateLabel: string
  heroLede: string

  // Alcance
  scopeHeading: string
  scopeLede: string
  scopePhases: ProposalScopePhase[]
  scopePaths?: ProposalScopePath[]

  // Inversión
  investmentHeading: string
  investmentPhases: ProposalInvestmentPhase[]
  investmentNote?: string

  // Información importante
  termsNote: string
  exclusions: string[]

  // Preguntas propias de este proyecto
  extraFaq?: ProposalFaqEntry[]
}

export type ProposalStatus = 'draft' | 'accepted' | 'sent' | 'viewed'

/** Propuesta completa (vista admin). */
export interface Proposal {
  id: string
  token: string
  title: string
  status: ProposalStatus
  content: ProposalContent
  model: string | null
  amount: string | null
  currency: string
  dealId: string | null
  contactId: string | null
  publicUrl: string
  acceptedAt: string | null
  sentAt: string | null
  viewedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Vista pública (lo que ve el cliente por el token). */
export interface PublicProposal {
  title: string
  status: ProposalStatus
  content: ProposalContent
  updatedAt: string
}
