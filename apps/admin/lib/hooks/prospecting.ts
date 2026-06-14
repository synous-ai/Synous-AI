import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiList, apiPost } from '../api'
import type {
  Prospect,
  ProspectSearch,
  ProspectingCapabilities,
} from '../types'

export function useProspectingCapabilities() {
  return useQuery({
    queryKey: ['prospecting', 'capabilities'],
    queryFn: () => apiGet<ProspectingCapabilities>('/api/prospecting/capabilities'),
    staleTime: 600_000,
  })
}

export function useProspectSearches() {
  return useQuery({
    queryKey: ['prospecting', 'searches'],
    queryFn: async () =>
      (await apiList<ProspectSearch[]>('/api/prospecting/searches?limit=50')).data,
  })
}

/** Historial acumulado de prospectos del portal (para tracking + dedup visible). */
export function useProspects() {
  return useQuery({
    queryKey: ['prospecting', 'prospects'],
    queryFn: () => apiGet<Prospect[]>('/api/prospecting/prospects'),
  })
}

export interface RunProspectSearchInput {
  query: string
  limit: number
  ourServices?: string
}

export interface RunProspectSearchResult {
  search: ProspectSearch
  prospects: Prospect[]
}

export function useRunProspectSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RunProspectSearchInput) =>
      apiPost<RunProspectSearchResult>('/api/prospecting/search', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospecting'] })
    },
  })
}

export function useSuggestServices() {
  return useMutation({
    mutationFn: (hint: string) =>
      apiPost<{ services: string }>('/api/prospecting/suggest-services', { hint }),
  })
}

export function useImportProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ contactId: string; companyId: string }>(
        `/api/prospecting/prospects/${id}/import`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospecting'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}

export function useDiscardProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<Prospect>(`/api/prospecting/prospects/${id}/discard`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospecting'] })
    },
  })
}
