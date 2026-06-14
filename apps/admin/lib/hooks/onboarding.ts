import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../api'
import type { OnboardingSubmission } from '../types'

export function useOnboardingSubmissions() {
  return useQuery({
    queryKey: ['onboarding', 'submissions'],
    queryFn: () => apiGet<OnboardingSubmission[]>('/api/onboarding/submissions'),
  })
}
