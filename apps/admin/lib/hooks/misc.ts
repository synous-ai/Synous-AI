import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, getAdminToken, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import { createFileTransfer, FILE_PURPOSE_ACCEPT } from '../file-transfer'
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

/**
 * Listado de notificaciones del equipo.
 *
 * Pollea igual que el contador: sin esto el badge subía (el contador sí
 * polleaba) pero la lista quedaba con datos viejos hasta una invalidación
 * manual, así que abrías la campana y no veías la notificación que el número
 * te acababa de anunciar.
 *
 * Trae A PROPÓSITO solo las 20 más recientes (una página del endpoint paginado,
 * sin seguir `meta.nextCursor`): la campana es un panel de novedades, no un
 * historial, y lo pendiente lo cuenta `useUnreadCount` sobre el total.
 */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<AppNotification[]>('/api/notifications?limit=20'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiGet<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 60_000,
    // No pollear con la pestaña en background (ahorra requests con varias
    // pestañas abiertas).
    //
    // El polling es el respaldo del WebSocket del bell: la conexión se corta
    // al llegar a la duración máxima de la Function en Vercel y, mientras
    // reconecta, un evento puede no llegar en vivo.
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
    queryFn: () => fetchAllPages<LibraryItem>(apiList, `/api/library${qs}`),
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
 * Instancia única del módulo compartido de transferencia de archivos para el
 * admin (basePath '/api' + token de Clerk del hub_user). Ver lib/file-transfer.ts
 * — la misma lógica la instancia el portal con basePath '/api/client'.
 */
const fileTransfer = createFileTransfer({ basePath: '/api', getToken: getAdminToken })

export const uploadFile = fileTransfer.uploadFile
export const getFileAccessUrl = fileTransfer.getFileAccessUrl
export const openFile = fileTransfer.openFile
export const useFileUrl = fileTransfer.useFileUrl
export { FILE_PURPOSE_ACCEPT }
export type { FilePurpose, UploadedFile } from '../file-transfer'
