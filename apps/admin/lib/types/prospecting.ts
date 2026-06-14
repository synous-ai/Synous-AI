export type ProspectProposalType = 'automation' | 'web_app' | 'both'

export interface SettingObjection {
  objection: string
  response: string
}

export interface SettingSequence {
  opener: string
  problemQuestions: string[]
  bookingMessage: string
  confirmationMessage: string
}

export interface ProspectProposal {
  analysis: string
  opportunityScore: number
  proposalType: ProspectProposalType
  painPoints: string[]
  solution: string
  mvpScope: string[]
  estimatedValueUsd: number
  sequence: SettingSequence
  objections: SettingObjection[]
}

export type ProspectStatus = 'new' | 'imported' | 'discarded'

export interface Prospect {
  id: string
  searchId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  rating: number | null
  userRatingsTotal: number | null
  types: string[]
  aiAnalysis: string | null
  aiProposal: ProspectProposal | null
  status: ProspectStatus
  importedContactId: string | null
  createdAt: string
}

export interface ProspectSearch {
  id: string
  query: string
  ourServices: string | null
  requestedLimit: number
  resultCount: number
  status: 'running' | 'completed' | 'failed'
  error: string | null
  createdAt: string
}

export interface ProspectingCapabilities {
  places: boolean
  ai: boolean
}
