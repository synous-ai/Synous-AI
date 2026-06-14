import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import type {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
  Deliverable,
  ChangeRequest,
  DealIntake,
  IntakeForm,
  CRDetail,
  Document,
  DocumentType,
} from '../types'

// ─── Documents ────────────────────────────────────────────────────────────────

export function useDealDocuments(dealId: string | null) {
  return useQuery({
    queryKey: ['documents', dealId],
    queryFn: () => apiGet<Document[]>(`/api/documents?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export interface CreateDocumentInput {
  dealId: string
  crId?: string
  name: string
  type: DocumentType
  storageKey?: string
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => apiPost<Document>('/api/documents', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/api/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useWorkItems({
  type,
  status,
  assignedTo,
}: { type?: WorkItemType; status?: WorkItemStatus; assignedTo?: string } = {}) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (status) params.set('status', status)
  if (assignedTo) params.set('assignedTo', assignedTo)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return useQuery({
    queryKey: ['work-items', type ?? 'all', status ?? 'all', assignedTo ?? 'all'],
    queryFn: () => apiGet<WorkItem[]>(`/api/work-items${qs}`),
  })
}

export interface WorkItemInput {
  type: WorkItemType
  title: string
  description?: string
  status?: WorkItemStatus
  priority?: WorkItemPriority
  /** Horizonte de planificación — solo relevante cuando type='roadmap'. */
  timeframe?: 'now' | 'next' | 'later'
  dealId?: string
  assignedTo?: string
}

export function useCreateWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkItemInput) => apiPost<WorkItem>('/api/work-items', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-items'] }),
  })
}

export function useUpdateWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<WorkItemInput> }) =>
      apiPatch<WorkItem>(`/api/work-items/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-items'] }),
  })
}

export function useDeleteWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/work-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-items'] }),
  })
}

export function useDeliverables(dealId: string | null) {
  return useQuery({
    queryKey: ['deliverables', dealId],
    queryFn: () => apiGet<Deliverable[]>(`/api/deliverables?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export interface DeliverableInput {
  dealId: string
  title: string
  type: 'design' | 'prototype' | 'staging' | 'final'
  url?: string
  description?: string
}

export function useCreateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DeliverableInput) => apiPost<Deliverable>('/api/deliverables', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliverables'] }),
  })
}

export function useUpdateDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ status: string; title: string; url: string; feedback: string }> }) =>
      apiPatch<Deliverable>(`/api/deliverables/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliverables'] }),
  })
}

export function useDeleteDeliverable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/deliverables/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliverables'] }),
  })
}

export function useDealCRs(dealId: string | null) {
  return useQuery({
    queryKey: ['change-requests', dealId],
    queryFn: () => apiGet<ChangeRequest[]>(`/api/change-requests?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export interface CRItemInput {
  description: string
  unitPrice: number
  quantity?: number
}

export interface CRInput {
  dealId: string
  title: string
  description: string
  totalAmount?: number
  timelineImpactDays?: number
  items?: CRItemInput[]
}

export function useCreateCR() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CRInput) => apiPost<ChangeRequest>('/api/change-requests', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests'] }),
  })
}

export function useCRDetail(id: string | null) {
  return useQuery({
    queryKey: ['change-requests', 'detail', id],
    queryFn: () => apiGet<CRDetail>(`/api/change-requests/${id}`),
    enabled: id != null,
  })
}

export function useCRTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      apiPost(`/api/change-requests/${id}/transition`, { status, comment }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests'] })
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

export function useCRComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiPost(`/api/change-requests/${id}/comments`, { body }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

export function useDealIntakes(dealId: string | null) {
  return useQuery({
    queryKey: ['deal-intakes', dealId],
    queryFn: () => apiGet<DealIntake[]>(`/api/intake/deal-intakes?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export function useIntakeForms() {
  return useQuery({ queryKey: ['intake-forms'], queryFn: () => apiGet<IntakeForm[]>('/api/intake/forms') })
}

export interface IntakeFormInput {
  name: string
  description?: string
  fields: { name: string; label: string; type: string }[]
}

export function useCreateIntakeForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: IntakeFormInput) => apiPost<IntakeForm>('/api/intake/forms', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intake-forms'] }),
  })
}

export function useAssignIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, formId }: { dealId: string; formId: string }) =>
      apiPost('/api/intake/deal-intakes', { dealId, formId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal-intakes'] }),
  })
}
