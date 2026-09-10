// Instancia el api-client para el contexto del admin (hub_user) con Clerk como
// proveedor de tokens. El token se obtiene de forma ASÍNCRONA desde la sesión
// activa de Clerk (clerk.session.getToken()) en lugar del Zustand store.
//
// La firma de getToken es `() => Promise<string | null>`, compatible con la
// firma ampliada del factory de @nous/api-client (sync | async union).
//
// El client portal (portal-lib/lib/api.ts) NO se modifica — sigue usando su
// getter SYNC desde el Zustand store propio.

import { createApiClient, ApiError as _ApiError } from '@nous/api-client'

/**
 * Obtiene el Clerk session token fresco para adjuntar como Bearer.
 *
 * Usa `window.Clerk` (el singleton inyectado por ClerkProvider) para poder
 * llamar getToken() fuera de componentes React (ej: desde mutation functions
 * de hooks, upload helpers, etc.).
 *
 * Devuelve null si no hay sesión activa o si Clerk no está disponible
 * (SSR, primer render antes de que ClerkProvider hidrate).
 */
async function getAdminToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk
  if (!clerk) return null
  // Esperar a que Clerk TERMINE de cargar antes de leer la sesión. Sin esto hay
  // un race en el primer render: los hooks de TanStack Query disparan antes de
  // que `window.Clerk.session` esté seteado → getToken() devuelve null → la API
  // responde 401 → onAuthFailure redirige a /login (loop). `load()` es idempotente.
  try {
    if (!clerk.loaded && typeof clerk.load === 'function') {
      await clerk.load()
    }
  } catch {
    /* ignore */
  }
  if (!clerk.session) return null
  try {
    return await (clerk.session.getToken() as Promise<string | null>)
  } catch {
    return null
  }
}

const client = createApiClient({
  // El admin ya no usa refresh via cookie propio — Clerk auto-gestiona su sesión.
  // refreshPath se omite deliberadamente: tryRefresh() devolverá false de inmediato.
  getToken: getAdminToken,
  // onAuthFailure: el backend devolvió 401 CON una sesión de Clerk activa — es
  // una sesión "huérfana" (usuario de Clerk sin hub_user vinculado; típico: un
  // cliente del portal, o un hub_user con clerk_user_id placeholder del seed).
  //
  // Redirigir sin cerrar la sesión dejaba al usuario trabado: /admin/login no
  // monta el <SignIn> de Clerk si hay sesión activa, así que veía un panel
  // vacío, y cualquier página que siguiera llamando a la API rebotaba en loop.
  // Por eso cerramos la sesión PRIMERO y sólo después navegamos (y nunca si ya
  // estamos en el login). Mismo patrón que portal-lib/lib/api.ts.
  onAuthFailure: () => {
    if (typeof window === 'undefined') return
    console.warn(
      '[admin-auth] 401 del backend con sesión de Clerk activa — sesión sin hub_user vinculado; cerrando sesión para evitar quedar trabado en el login',
    )
    const clerk = (window as unknown as { Clerk?: { session?: unknown; signOut?: () => Promise<void> } }).Clerk
    const goLogin = (): void => {
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login'
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
export const apiList = client.apiList

// Re-export the class so callers can do: import { ApiError } from '@/lib/api'
export { _ApiError as ApiError }
