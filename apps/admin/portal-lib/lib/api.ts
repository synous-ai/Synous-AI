// Instancia el api-client para el contexto del portal de cliente (client_account).
// CA2: migrado a Clerk — el token se obtiene de forma ASÍNCRONA desde la sesión
// activa de Clerk (window.Clerk.session.getToken()), igual que el admin.
// No hay refreshPath propio: Clerk auto-gestiona su sesión.

import { createApiClient, ApiError as _ApiError } from '@nous/api-client'

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
  // onAuthFailure: redirigir al login del portal. El middleware de Clerk
  // también bloquea el acceso, pero cubrimos el caso de un 401 inesperado.
  onAuthFailure: () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/portal/login'
    }
  },
})

export const apiGet = client.apiGet
export const apiPost = client.apiPost
export const apiPatch = client.apiPatch
export const apiDelete = client.apiDelete

// Re-export the class so callers can do: import { ApiError } from '@portal/lib/api'
export { _ApiError as ApiError }
