import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '../api'
import type {
  SetterDraft,
  SetterDraftDetail,
  SetterConfig,
  SendResult,
  ModelProvider,
  SetterEvent,
} from '../types'

// ─── Queries ────────────────────────────────────────────────────────────────

export function useSetterDrafts() {
  return useQuery({
    queryKey: ['setter', 'drafts'],
    queryFn: () => apiGet<SetterDraft[]>('/api/setter/drafts'),
  })
}

export function useSetterDraft(id: string | null) {
  return useQuery({
    queryKey: ['setter', 'draft', id],
    queryFn: () => apiGet<SetterDraftDetail>(`/api/setter/drafts/${id}`),
    enabled: Boolean(id),
  })
}

export function useSetterConfig() {
  return useQuery({
    queryKey: ['setter', 'config'],
    queryFn: () => apiGet<SetterConfig>('/api/setter/config'),
  })
}

/** Consola: historia inicial del log (la actividad en vivo llega por WebSocket). */
export function useSetterEvents() {
  return useQuery({
    queryKey: ['setter', 'events'],
    queryFn: () => apiGet<SetterEvent[]>('/api/setter/events?limit=150'),
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useApproveDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<SendResult>(`/api/setter/drafts/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter'] }),
  })
}

export function useEditDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiPost<SendResult>(`/api/setter/drafts/${id}/edit`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter'] }),
  })
}

export function useRejectDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ id: string; status: string }>(`/api/setter/drafts/${id}/reject`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter'] }),
  })
}

export function useRegenerateDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<SetterDraftDetail>(`/api/setter/drafts/${id}/regenerate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter'] }),
  })
}

export function useSetModelProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (modelProvider: ModelProvider) =>
      apiPatch<SetterConfig>('/api/setter/config/model-provider', { modelProvider }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter', 'config'] }),
  })
}

export function useSetProspectingAutopilot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiPatch<SetterConfig>('/api/setter/config/autopilot', { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setter', 'config'] }),
  })
}
