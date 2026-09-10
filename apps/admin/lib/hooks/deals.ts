import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiList, apiPatch, apiPost, apiDelete } from '../api'
import type { Deal, DealDetail } from '../types'

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => (await apiList<Deal[]>('/api/deals?limit=100')).data,
  })
}

export function useDealDetail(id: string | null) {
  return useQuery({
    queryKey: ['deals', 'detail', id],
    queryFn: () => apiGet<DealDetail>(`/api/deals/${id}/detail`),
    enabled: id != null,
  })
}

export interface NewDealInput {
  name: string
  amount?: number
  stageId: string
  pipelineId: string
  companyId?: string
  primaryContactId?: string
  closeDate?: string
}

export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewDealInput) => apiPost<Deal>('/api/deals', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

export interface UpdateDealInput {
  name?: string
  amount?: number
  closeDate?: string
  companyId?: string
  primaryContactId?: string
}

export function useUpdateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDealInput }) => apiPatch<Deal>(`/api/deals/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

export function useArchiveDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/deals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

export function useChangeStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      apiPatch<Deal>(`/api/deals/${dealId}/stage`, { stageId }),
    onMutate: async ({ dealId, stageId }) => {
      await qc.cancelQueries({ queryKey: ['deals'] })
      const prev = qc.getQueryData<Deal[]>(['deals'])
      qc.setQueryData<Deal[]>(['deals'], (old) => old?.map((d) => (d.id === dealId ? { ...d, stageId } : d)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['deals'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

export function useAddDealContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, contactId, role }: { dealId: string; contactId: string; role?: string }) =>
      apiPost<{ success: boolean }>(`/api/deals/${dealId}/contacts`, { contactId, role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

export function useRemoveDealContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, contactId }: { dealId: string; contactId: string }) =>
      apiDelete<{ success: boolean }>(`/api/deals/${dealId}/contacts/${contactId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

/** Respuesta de POST /api/deals/:id/activate-portal — ver deals.service.ts (backend) para el detalle de cada status. */
export interface ActivatePortalResult {
  status: 'activated' | 'already_active' | 'missing_contact' | 'missing_email'
  clientEmail: string | null
}

/**
 * Invita manualmente al contacto principal del deal al Client Portal.
 * Endpoint idempotente (siempre 200): el `status` de la respuesta indica qué pasó,
 * nunca lanza por los casos de negocio ya cubiertos (sin contacto / sin email / ya activo).
 * Al resolver, invalida el detalle del deal para que `clientPortal` se refresque solo.
 */
export function useActivatePortal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dealId: string) => apiPost<ActivatePortalResult>(`/api/deals/${dealId}/activate-portal`, {}),
    onSuccess: (_data, dealId) => qc.invalidateQueries({ queryKey: ['deals', 'detail', dealId] }),
  })
}
