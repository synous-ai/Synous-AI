import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiUpload } from './api'
import type {
  Deal,
  Deliverable,
  ClientIntake,
  ChangeRequest,
  ClientInvoice,
  ClientDocument,
  OnboardingStateDTO,
  ClientOnboarding,
  OnboardingBriefAnswers,
  OnboardingMaterialsState,
  OnboardingMaterialCategory,
  OnboardingAsset,
  CompleteOnboardingResultDTO,
} from './types'

// ─── Deals ──────────────────────────────────────────────────────────────────

export function useClientDeals() {
  return useQuery<Deal[]>({
    queryKey: ['client', 'deals'],
    queryFn: () => apiGet<Deal[]>('/api/client/deals'),
  })
}

// ─── Deliverables ────────────────────────────────────────────────────────────

export function useClientDeliverables() {
  return useQuery<Deliverable[]>({
    queryKey: ['client', 'deliverables'],
    queryFn: () => apiGet<Deliverable[]>('/api/client/deliverables'),
  })
}

export function useApproveDeliverable() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, string>({
    mutationFn: (id) => apiPost<{ success: true }>(`/api/client/deliverables/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', 'deliverables'] })
    },
  })
}

export function useRequestChanges() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; feedback: string }>({
    mutationFn: ({ id, feedback }) =>
      apiPost<{ success: true }>(`/api/client/deliverables/${id}/request-changes`, { feedback }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', 'deliverables'] })
    },
  })
}

// ─── Intakes ──────────────────────────────────────────────────────────────────

export function useClientIntakes() {
  return useQuery<ClientIntake[]>({
    queryKey: ['intakes'],
    queryFn: () => apiGet<ClientIntake[]>('/api/client/intakes'),
  })
}

export function useRespondIntake() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; answers: Record<string, string> }>({
    mutationFn: ({ id, answers }) =>
      apiPost<{ success: true }>(`/api/client/intakes/${id}/respond`, { answers }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intakes'] })
    },
  })
}

// ─── Change Requests ──────────────────────────────────────────────────────────

export function useClientChangeRequests() {
  return useQuery<ChangeRequest[]>({
    queryKey: ['change-requests'],
    queryFn: () => apiGet<ChangeRequest[]>('/api/client/change-requests'),
  })
}

export function useApproveCR() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) =>
      apiPost<{ success: true }>(`/api/client/change-requests/${id}/approve`, comment ? { comment } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-requests'] })
    },
  })
}

export function useRejectCR() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) =>
      apiPost<{ success: true }>(`/api/client/change-requests/${id}/reject`, comment ? { comment } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-requests'] })
    },
  })
}

export function useCommentCR() {
  return useMutation<void, Error, { id: string; body: string }>({
    mutationFn: ({ id, body }) =>
      apiPost<void>(`/api/client/change-requests/${id}/comments`, { body }),
  })
}

// ─── Invoices ──────────────────────────────────────────────────────────────────

export function useClientInvoices() {
  return useQuery<ClientInvoice[]>({
    queryKey: ['client', 'invoices'],
    queryFn: () => apiGet<ClientInvoice[]>('/api/client/invoices'),
  })
}

// ─── Documents ──────────────────────────────────────────────────────────────────

export function useClientDocuments() {
  return useQuery<ClientDocument[]>({
    queryKey: ['client', 'documents'],
    queryFn: () => apiGet<ClientDocument[]>('/api/client/documents'),
  })
}

// ─── Onboarding POST-VENTA (wizard de 8 pasos) ───────────────────────────────
// Ver apps/api/src/modules/onboarding/client-onboarding.router.ts (prefix
// /api/client/onboarding). Todas las mutations invalidan la query de estado
// para que el wizard resuma con `currentStep`/`stepsCompleted` frescos.

const ONBOARDING_QUERY_KEY = ['client', 'onboarding'] as const

export function useClientOnboarding() {
  return useQuery<OnboardingStateDTO>({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => apiGet<OnboardingStateDTO>('/api/client/onboarding'),
  })
}

/** Paso 1-4: marca un paso de orientación como visto. */
export function useMarkOnboardingProgress() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, number>({
    mutationFn: (step) => apiPatch<ClientOnboarding>('/api/client/onboarding/progress', { step }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 5: firma (checkbox + nombre). 409 si ya estaba firmado. */
export function useSubmitOnboardingSignature() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, { fullName: string; accepted: true }>({
    mutationFn: (body) => apiPost<ClientOnboarding>('/api/client/onboarding/signature', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 6: brief de 16 preguntas. Re-submit permitido (sobreescribe). */
export function useSubmitOnboardingBrief() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, OnboardingBriefAnswers>({
    mutationFn: (answers) => apiPost<ClientOnboarding>('/api/client/onboarding/brief', answers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 7: sube un archivo de materiales para una categoría y devuelve el asset creado. */
export function useUploadOnboardingMaterial() {
  const queryClient = useQueryClient()
  return useMutation<OnboardingAsset, Error, { category: OnboardingMaterialCategory; file: File }>({
    mutationFn: ({ category, file }) =>
      apiUpload<OnboardingAsset>(`/api/client/onboarding/materials/upload?category=${category}`, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 7: guarda el estado (done/assetIds/note) de las 4 categorías de materiales. */
export function useSubmitOnboardingMaterials() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, OnboardingMaterialsState>({
    mutationFn: (materials) => apiPost<ClientOnboarding>('/api/client/onboarding/materials', { materials }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 8: gate final. 400 con `{ missing: string[] }` si falta firma/brief/materiales. */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  return useMutation<CompleteOnboardingResultDTO, Error, void>({
    mutationFn: () => apiPost<CompleteOnboardingResultDTO>('/api/client/onboarding/complete'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}
