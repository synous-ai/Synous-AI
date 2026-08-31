// Instancia el api-client para el contexto del portal de cliente (client_account).
// CA2: migrado a Clerk — el token se obtiene de forma ASÍNCRONA desde la sesión
// activa de Clerk (window.Clerk.session.getToken()), igual que el admin.
// No hay refreshPath propio: Clerk auto-gestiona su sesión.

import { createApiClient, ApiError as _ApiError } from '@nous/api-client'
import { API_URL } from '@nous/shared'

/**
 * Obtiene el Clerk session token fresco para adjuntar como Bearer.
 *
 * Usa `window.Clerk` (singleton inyectado por ClerkProvider en el root layout)
 * para poder llamar getToken() fuera de componentes React.
 *
 * Devuelve null si no hay sesión activa o si Clerk no terminó de cargar
 * (SSR, primer render).
 */
async function getPortalToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk
  if (!clerk) return null
  // Esperar a que Clerk termine de cargar antes de leer la sesión.
  // Sin esto puede haber un race en el primer render donde session === undefined.
  try {
    if (!clerk.loaded && typeof clerk.load === 'function') {
      await clerk.load()
    }
  } catch {
    /* ignorar — si falla, procedemos sin token */
  }
  if (!clerk.session) return null
  try {
    return await (clerk.session.getToken() as Promise<string | null>)
  } catch {
    return null
  }
}

const client = createApiClient({
  // No hay refresh vía cookie propio — Clerk auto-gestiona su sesión.
  // refreshPath se omite deliberadamente: tryRefresh() devuelve false de inmediato.
  getToken: getPortalToken,
  // onAuthFailure: el backend devolvió 401 con una sesión de Clerk activa —
  // es una sesión "huérfana" (usuario de Clerk sin client_account vinculado,
  // p. ej. un admin o una cuenta re-vinculada). Redirigir a login sin cerrar
  // la sesión generaba un LOOP de recarga: el login detecta sesión → /portal
  // → 401 → login → … Por eso acá cerramos la sesión de Clerk PRIMERO y solo
  // después navegamos (y nunca si ya estamos en el login).
  onAuthFailure: () => {
    if (typeof window === 'undefined') return
    console.warn(
      '[portal-auth] 401 del backend con sesión de Clerk activa — sesión sin client_account vinculado; cerrando sesión para evitar loop de recarga',
    )
    const clerk = (window as unknown as { Clerk?: { session?: unknown; signOut?: () => Promise<void> } }).Clerk
    const goLogin = (): void => {
      if (!window.location.pathname.startsWith('/portal/login')) {
        window.location.href = '/portal/login'
      }
    }
    if (clerk?.session && typeof clerk.signOut === 'function') {
      void clerk.signOut().then(goLogin, goLogin)
    } else {
      goLogin()
    }
  },
})

export const apiGet = client.apiGet
export const apiPost = client.apiPost
export const apiPatch = client.apiPatch
export const apiDelete = client.apiDelete

// Re-export the class so callers can do: import { ApiError } from '@portal/lib/api'
export { _ApiError as ApiError }

/**
 * Sube un archivo (multipart/form-data) con el token de Clerk del cliente.
 * El api-client compartido (@nous/api-client) no soporta FormData —mismo
 * patrón ya usado en brand-kit-form.tsx para /api/client/files—, así que acá
 * hacemos el fetch directo reusando getPortalToken().
 */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  const token = await getPortalToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
    body: fd,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error
    throw new _ApiError(err?.code ?? 'ERROR', err?.message ?? 'Error de red', res.status)
  }
  return (json as { data: T }).data
}
