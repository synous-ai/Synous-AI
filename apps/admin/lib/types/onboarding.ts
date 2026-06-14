export type OnboardingDecision = 'call' | 'proposal'

export interface OnboardingSubmission {
  id: string
  fullName: string
  email: string
  company: string | null
  decision: OnboardingDecision
  answers: Record<string, unknown>
  contactId: string | null
  dealId: string | null
  dealName: string | null
  createdAt: string
}
