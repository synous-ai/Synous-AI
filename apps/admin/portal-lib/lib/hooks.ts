import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import type { Deal, Deliverable, ClientIntake, ChangeRequest, ClientInvoice, ClientDocument } from './types'

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
