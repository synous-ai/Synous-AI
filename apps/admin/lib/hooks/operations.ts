import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type { ChangeRequestBucket } from '@synous/shared'
import type {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
  Deliverable,
  ChangeRequest,
  ChangeRequestListItem,
  CRSummary,
  CRProposal,
  DealIntake,
  IntakeForm,
  CRDetail,
  Document,
  DocumentType,
  ProjectUpdate,
} from '../types'

// ─── Documents ────────────────────────────────────────────────────────────────

export function useDealDocuments(dealId: string | null) {
  return useQuery({
    queryKey: ['documents', dealId],
    queryFn: () => fetchAllPages<Document>(apiList, `/api/documents?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export interface CreateDocumentInput {
  dealId: string
  crId?: string
  name: string
  type: DocumentType
  storageKey?: string
  /** Omitido = visible al cliente (default del backend). */
  visibleToClient?: boolean
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
    queryFn: () => fetchAllPages<WorkItem>(apiList, `/api/work-items${qs}`),
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
    queryFn: () => fetchAllPages<Deliverable>(apiList, `/api/deliverables?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

export interface DeliverableInput {
  dealId: string
  title: string
  type: 'design' | 'prototype' | 'staging' | 'final'
  url?: string
  description?: string
  /** Omitido = visible al cliente (default del backend). */
  visibleToClient?: boolean
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
    mutationFn: ({ id, input }: { id: string; input: Partial<{ status: string; title: string; url: string; feedback: string; visibleToClient: boolean }> }) =>
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

// ─── Novedades de proyecto ("estado de proyecto visible al cliente") ──────────
// Ver apps/api/src/modules/deals/{project-updates.schema,project-updates.service}.ts
// (montado en deals.router.ts, prefix /api/deals). El listado admin incluye
// TODAS las novedades (con `archived`); el cliente solo ve las no archivadas.

export function useDealUpdates(dealId: string | null) {
  return useQuery({
    queryKey: ['deals', 'updates', dealId],
    queryFn: () => apiGet<ProjectUpdate[]>(`/api/deals/${dealId}/updates`),
    enabled: dealId != null,
  })
}

export function useCreateDealUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, body, stageId }: { dealId: string; body: string; stageId?: string }) =>
      apiPost<ProjectUpdate>(`/api/deals/${dealId}/updates`, { body, stageId }),
    onSuccess: (_data, { dealId }) => qc.invalidateQueries({ queryKey: ['deals', 'updates', dealId] }),
  })
}

export function useArchiveDealUpdate() {
  const qc = useQueryClient()
  return useMutation({
    // `dealId` no viaja en la URL (el endpoint de archive solo toma el id de la
    // novedad) — lo recibimos igual para poder invalidar la queryKey correcta.
    mutationFn: ({ id }: { id: string; dealId: string }) =>
      apiPatch<{ success: boolean }>(`/api/deals/updates/${id}/archive`),
    onSuccess: (_data, { dealId }) => qc.invalidateQueries({ queryKey: ['deals', 'updates', dealId] }),
  })
}

export function useDealCRs(dealId: string | null) {
  return useQuery({
    queryKey: ['change-requests', 'deal', dealId],
    queryFn: () => fetchAllPages<ChangeRequest>(apiList, `/api/change-requests?dealId=${dealId}`),
    enabled: dealId != null,
  })
}

/**
 * Filtros del listado global de CRs — reflejan 1:1 el querystring de
 * `GET /api/change-requests` (contrato congelado). `status` viaja como CSV.
 */
export interface CRListFilters {
  dealId?: string
  status?: string[]
  bucket?: ChangeRequestBucket
  origin?: 'client' | 'agency'
  q?: string
}

function buildCRQuery(filters: CRListFilters): string {
  const params = new URLSearchParams()
  if (filters.dealId) params.set('dealId', filters.dealId)
  if (filters.status?.length) params.set('status', filters.status.join(','))
  if (filters.bucket) params.set('bucket', filters.bucket)
  if (filters.origin) params.set('origin', filters.origin)
  if (filters.q) params.set('q', filters.q)
  return params.toString()
}

/**
 * Todas las CRs del portal (o filtradas), sin necesidad de entrar deal por
 * deal — alimenta la cola de trabajo de /admin/change-requests. Los contadores
 * reales por bucket vienen de `useCRSummary`, no de contar este resultado en
 * el cliente (el filtro activo recorta lo que se ve, no lo que existe).
 */
export function useAllCRs(filters: CRListFilters = {}) {
  const qs = buildCRQuery(filters)
  return useQuery({
    queryKey: ['change-requests', 'all', filters],
    queryFn: () => fetchAllPages<ChangeRequestListItem>(apiList, `/api/change-requests${qs ? `?${qs}` : ''}`),
  })
}

/** Contadores reales por bucket (`GET /summary`) — nunca se derivan contando en el cliente. */
export function useCRSummary(dealId?: string | null) {
  const qs = dealId ? `?dealId=${dealId}` : ''
  return useQuery({
    queryKey: ['change-requests', 'summary', dealId ?? 'all'],
    queryFn: () => apiGet<CRSummary>(`/api/change-requests/summary${qs}`),
  })
}

export interface CRItemInput {
  description: string
  unitPrice: number
  quantity?: number
  hours?: number
}

export interface CRInput {
  dealId: string
  title: string
  description: string
  context?: string
  priority?: string
  originalScopeRef?: string
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
    // Invalidar el prefijo 'change-requests' alcanza summary + all + deal + detail:
    // TanStack Query matchea por prefijo de queryKey (exact:false es el default).
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests'] })
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

/**
 * Referencia a un archivo YA subido. Viaja SOLO la `storageKey`: nombre, MIME y
 * tamaño los resuelve el backend contra el ledger `file_upload` al reclamar la
 * subida, y descarta lo que declare el cliente. Mandar esos campos sugeriría un
 * control que el front no tiene.
 */
export interface CRCommentUploadInput {
  storageKey: string
}

export function useCRComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body, uploads }: { id: string; body: string; uploads?: CRCommentUploadInput[] }) =>
      apiPost(`/api/change-requests/${id}/comments`, { body, uploads }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

/** Adjunta archivos ya subidos (storageKey) a la CR — no crea comentario. */
export function useUploadCRAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, uploads }: { id: string; uploads: CRCommentUploadInput[] }) =>
      apiPost(`/api/change-requests/${id}/attachments`, { uploads }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

export interface CRProposalItemInput {
  description: string
  unitPrice: number
  quantity?: number
  hours?: number
}

export interface CRProposalInput {
  scope?: string
  amount?: number
  currency?: string
  timelineImpactDays?: number
  newDeliveryDate?: string
  note?: string
  items?: CRProposalItemInput[]
  /** Default del backend: true (crea Y envía). false = guarda como borrador interno. */
  send?: boolean
}

/** Crea la versión N+1 de propuesta. Con `send` (default true) la manda al cliente y la CR pasa a 'sent'. */
export function useCreateCRProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CRProposalInput }) =>
      apiPost<CRProposal>(`/api/change-requests/${id}/proposals`, input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests'] })
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

/** Edita en el lugar una propuesta que sigue en 'draft' (no incrementa versión, no envía). */
export function useUpdateCRProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, proposalId, input }: { id: string; proposalId: string; input: Partial<CRProposalInput> }) =>
      apiPatch<CRProposal>(`/api/change-requests/${id}/proposals/${proposalId}`, input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests', 'detail', variables.id] })
    },
  })
}

/**
 * Envía una propuesta que estaba en borrador (`draftProposal` del detalle) sin
 * crear una versión nueva — a diferencia de `useCreateCRProposal`, que SIEMPRE
 * incrementa versión. La CR pasa a 'sent'; el backend valida la transición
 * igual que cualquier otra (ver `ADMIN_TRANSITIONS`).
 */
export function useSendCRProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, proposalId }: { id: string; proposalId: string }) =>
      apiPost<CRProposal>(`/api/change-requests/${id}/proposals/${proposalId}/send`),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['change-requests'] })
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
