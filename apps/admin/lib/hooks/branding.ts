import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiPatch, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type { ClientBranding, UpdateBrandingInput } from '../types'

export function useClientBranding() {
  return useQuery({
    queryKey: ['branding', 'clients'],
    queryFn: () => fetchAllPages<ClientBranding>(apiList, '/api/branding/clients'),
  })
}

export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBrandingInput }) =>
      apiPatch<ClientBranding>(`/api/branding/clients/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  })
}
