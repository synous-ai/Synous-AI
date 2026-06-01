import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiList, apiPatch, apiPost, apiDelete } from '../api'
import type { Company, CompanyDetail } from '../types'

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => (await apiList<Company[]>('/api/companies?limit=100')).data,
  })
}

/** Detalle enriquecido para el Company Detail (empresa + contactos + deals + notas + tareas + historial). */
export function useCompanyDetail(id: string | null) {
  return useQuery({
    queryKey: ['companies', 'detail', id],
    queryFn: () => apiGet<CompanyDetail>(`/api/companies/${id}/detail`),
    enabled: id != null,
  })
}

export interface CompanyInput {
  name: string
  domain?: string
  industry?: string
  phone?: string
  website?: string
}

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CompanyInput) => apiPost<Company>('/api/companies', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CompanyInput> }) =>
      apiPatch<Company>(`/api/companies/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useArchiveCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/companies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })
}
