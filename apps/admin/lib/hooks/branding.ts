import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_URL } from '@nous/shared'
import { apiGet, apiPatch } from '../api'
import type { ClientBranding, UpdateBrandingInput } from '../types'

/**
 * Obtiene el token de Clerk para requests multipart que no pasan por el api-client.
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

export function useClientBranding() {
  return useQuery({
    queryKey: ['branding', 'clients'],
    queryFn: () => apiGet<ClientBranding[]>('/api/branding/clients'),
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

/** Sube un logo vía el módulo de archivos (multipart) y devuelve su storageKey. */
export async function uploadBrandLogo(file: File): Promise<{ storageKey: string; url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  const token = await getAdminBearerToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}/api/files`, {
    method: 'POST',
    headers,
    body: fd,
  })
  if (!res.ok) throw new Error('No se pudo subir el logo')
  const json = (await res.json()) as { data: { storageKey: string; url: string } }
  return json.data
}
