import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import { API_URL } from '../config'
import { authToken } from '../store/auth'
import type {
  AppNotification,
  DashboardData,
  FocusData,
  LibraryItem,
  LibraryItemType,
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

export function useLibrary(type?: LibraryItemType) {
  const qs = type ? `?type=${type}` : ''
  return useQuery({
    queryKey: ['library', type ?? 'all'],
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

/** Sube un archivo al endpoint /api/files y devuelve el storageKey. */
export async function uploadFile(file: File): Promise<{ key: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const token = authToken.get()
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
