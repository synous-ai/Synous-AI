import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../api'
import type { AdminOnboardingListItemDTO, AdminOnboardingDetailDTO } from '../types'

/**
 * Progreso de onboarding POST-VENTA de cada deal. Ver
 * apps/api/src/modules/onboarding/onboarding.router.ts (prefix /api/onboarding,
 * admin — auth hub_user). Reemplaza al viejo useOnboardingSubmissions
 * (wizard público pre-venta, endpoint eliminado del backend).
 */
export function useOnboardingList() {
  return useQuery<AdminOnboardingListItemDTO[]>({
    queryKey: ['onboarding', 'list'],
    queryFn: () => apiGet<AdminOnboardingListItemDTO[]>('/api/onboarding'),
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
