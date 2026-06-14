// Tipos de propuestas — espejo de apps/api/src/modules/proposals/proposals.types.ts.
// Mantener en sync con el backend (mismo shape de ProposalContent).

export interface ProposalScopeItem {
  title: string
  description: string
}

export interface ProposalPhase {
  phase: string
  duration: string
  detail: string
}

export interface ProposalPricingItem {
  label: string
  amount: number
}

export interface ProposalPricing {
  items: ProposalPricingItem[]
  total: number
  currency: string
  note?: string
}

export interface ProposalContent {
  title: string
  clientName: string
  companyName?: string
  logoUrl?: string
  tagline?: string
  summary: string
  understanding: string
  objectives: string[]
  solution: string
  scope: ProposalScopeItem[]
  timeline: ProposalPhase[]
  pricing: ProposalPricing
  whyUs: string[]
  nextSteps: string
  terms?: string
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
