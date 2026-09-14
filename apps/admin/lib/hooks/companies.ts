import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type { Company, CompanyDetail } from '../types'

export interface CompanyBrandingDTO {
  brandName: string | null
  brandLogoKey: string | null
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

export interface CompanyBrandingInput {
  brandName?: string | null
  brandLogoKey?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => fetchAllPages<Company>(apiList, '/api/companies'),
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

/**
 * Marca del portal de cliente editada desde el panel (tarjeta "Marca" del
 * detalle de empresa) — mismos campos que edita el cliente desde /marca,
 * PATCH /api/companies/:id/branding. Audita en `record_history` pero NO
 * notifica (lo origina el propio equipo).
 */
export function useUpdateCompanyBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CompanyBrandingInput }) =>
      apiPatch<CompanyBrandingDTO>(`/api/companies/${id}/branding`, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['companies', 'detail', id] })
    },
  })
}
