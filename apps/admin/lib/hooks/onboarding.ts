import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import { uploadFile } from './misc'
import type { AdminOnboardingListItemDTO, AdminOnboardingDetailDTO, ClientOnboarding, OnboardingAsset } from '../types'

/**
 * Progreso de onboarding POST-VENTA de cada deal. Ver
 * apps/api/src/modules/onboarding/onboarding.router.ts (prefix /api/onboarding,
 * admin — auth hub_user). Reemplaza al viejo useOnboardingSubmissions
 * (wizard público pre-venta, endpoint eliminado del backend).
 */
export function useOnboardingList() {
  return useQuery<AdminOnboardingListItemDTO[]>({
    queryKey: ['onboarding', 'list'],
    queryFn: () => fetchAllPages<AdminOnboardingListItemDTO>(apiList, '/api/onboarding'),
  })
}

/** Detalle completo del onboarding de un deal: firma, brief (16 respuestas) y materiales. */
export function useOnboardingDetail(dealId: string | undefined) {
  return useQuery<AdminOnboardingDetailDTO>({
    queryKey: ['onboarding', 'detail', dealId],
    queryFn: () => apiGet<AdminOnboardingDetailDTO>(`/api/onboarding/deals/${dealId}`),
    enabled: !!dealId,
  })
}

const detailKey = (dealId: string) => ['onboarding', 'detail', dealId] as const

/**
 * Agrega un archivo de marca al deal desde el admin (categoría "Logo y manual
 * de marca") — mismo propósito de subida ('onboarding_material') que el resto
 * de los materiales. 409 si el deal no tiene una cuenta de cliente asociada.
 */
export function useAddDealBrandFile() {
  const qc = useQueryClient()
  return useMutation<
    OnboardingAsset,
    Error,
    { dealId: string; file: File; onProgress?: (percent: number) => void; signal?: AbortSignal }
  >({
    mutationFn: async ({ dealId, file, onProgress, signal }) => {
      const { storageKey } = await uploadFile(file, { purpose: 'onboarding_material', onProgress, signal })
      return apiPost<OnboardingAsset>(`/api/onboarding/deals/${dealId}/brand-files`, { storageKey })
    },
    onSuccess: (_asset, { dealId }) => qc.invalidateQueries({ queryKey: detailKey(dealId) }),
  })
}

/** Soft delete de un archivo de marca del deal (fila `client_asset`). */
export function useDeleteDealBrandFile() {
  const qc = useQueryClient()
  return useMutation<{ success: true }, Error, { dealId: string; assetId: string }>({
    mutationFn: ({ dealId, assetId }) =>
      apiDelete<{ success: true }>(`/api/onboarding/deals/${dealId}/brand-files/${assetId}`),
    onSuccess: (_data, { dealId }) => qc.invalidateQueries({ queryKey: detailKey(dealId) }),
  })
}

/**
 * Edita `brandIdentity` (brief, q11) desde el admin — mismas reglas que la
 * edición del cliente.
 *
 * `requestIdRef` ordena las respuestas: si el admin edita, el debounce
 * dispara un PATCH, edita de nuevo antes de que resuelva y ese segundo PATCH
 * resuelve PRIMERO, la respuesta del primero (más vieja) NO debe pisar la
 * caché con el texto anterior — solo la última request lanzada puede
 * escribir.
 */
export function useUpdateDealBrandIdentity() {
  const qc = useQueryClient()
  const requestIdRef = useRef(0)
  return useMutation<ClientOnboarding, Error, { dealId: string; brandIdentity: string }>({
    mutationFn: ({ dealId, brandIdentity }) => {
      const myId = ++requestIdRef.current
      return apiPatch<ClientOnboarding>(`/api/onboarding/deals/${dealId}/brand-identity`, { brandIdentity }).then(
        (updated) => {
          if (myId === requestIdRef.current) {
            qc.setQueryData<AdminOnboardingDetailDTO | undefined>(detailKey(dealId), (prev) =>
              prev ? { ...prev, onboarding: updated } : prev,
            )
          }
          return updated
        },
      )
    },
  })
}
