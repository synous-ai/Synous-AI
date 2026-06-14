import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import { API_URL } from '../config'
import type {
  AppNotification,
  DashboardData,
  FocusData,
  LibraryItem,
  LibraryItemType,
  LibraryKind,
  LibraryStep,
  ReportsData,
} from '../types'

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => apiGet<AppNotification[]>('/api/notifications') })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiGet<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 60_000,
    // No pollear cuando la pestaña está en background (ahorra requests con varias
    // pestañas/dispositivos abiertos; el WS ya refresca en vivo igual).
    refetchIntervalInBackground: false,
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ success: boolean }>('/api/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

/** Marca UNA notificación como leída (al abrirla). */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ success: boolean }>(`/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<DashboardData>('/api/dashboard') })
}

export function useFocus(mine?: boolean) {
  return useQuery({
    queryKey: ['focus', mine ?? false],
    queryFn: () => apiGet<FocusData>(`/api/focus${mine ? '?mine=true' : ''}`),
  })
}

export interface ReportsRange {
  from?: string // ISO 8601
  to?: string   // ISO 8601
}

export function useReports(range?: ReportsRange) {
  const qs = range
    ? new URLSearchParams(
        Object.entries(range)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, v as string]),
      ).toString()
    : ''
  return useQuery({
    queryKey: ['reports', range ?? null],
    queryFn: () => apiGet<ReportsData>(`/api/reports${qs ? `?${qs}` : ''}`),
  })
}

/**
 * Fetch de ítems de la biblioteca.
 * - `type`: filtra por tipo en el backend (ej: 'sop', 'document').
 * - `kind`: filtra por subtipo de SOP ('procedure' | 'checklist').
 *   Se pasa al querystring para que el backend filtre si lo soporta;
 *   el filtro client-side adicional vive en la página de /library/sops.
 * La queryKey incluye ambos parámetros para que TanStack Query cachee
 * correctamente por combinación de filtros.
 */
export function useLibrary(type?: LibraryItemType, kind?: LibraryKind) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (kind) params.set('kind', kind)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return useQuery({
    queryKey: ['library', type ?? 'all', kind ?? 'all'],
    queryFn: () => apiGet<LibraryItem[]>(`/api/library${qs}`),
  })
}

export interface LibraryItemInput {
  type: LibraryItemType
  name: string
  category?: string
  description?: string
  storageKey?: string
  url?: string
  /** Lista ordenada de pasos del SOP/procedimiento. Sin estado de ejecución. */
  steps?: LibraryStep[]
  /**
   * Subtipo dentro de 'sop'. Obligatorio cuando type='sop'.
   * Null o ausente para el resto de tipos.
   */
  kind?: LibraryKind | null
  /** ID del hub_user responsable (owner). Nullable para quitar el owner. */
  ownerId?: string | null
}

export function useCreateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LibraryItemInput) => apiPost<LibraryItem>('/api/library', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useUpdateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LibraryItemInput> }) =>
      apiPatch<LibraryItem>(`/api/library/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/library/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  })
}

/**
 * Obtiene el token de Clerk para requests de upload que no pasan por el api-client.
 * Usa el singleton window.Clerk (inyectado por ClerkProvider), igual que lib/api.ts.
 */
async function getAdminBearerToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk
  if (!clerk?.session) return null
  try {
    return await (clerk.session.getToken() as Promise<string | null>)
  } catch {
    return null
  }
}

/** Sube un archivo al endpoint /api/files y devuelve el storageKey. */
export async function uploadFile(file: File): Promise<{ key: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const token = await getAdminBearerToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}/api/files`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })

  if (!res.ok) {
    const json = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(json?.error?.message ?? 'No se pudo subir el archivo')
  }

  const json = await res.json() as { data: { storageKey: string } }
  return { key: json.data.storageKey }
}
