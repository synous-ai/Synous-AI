/**
 * Store de auth del admin (hub_user) — versión post-Clerk.
 *
 * Con Clerk como proveedor de identidad, el estado de autenticación vive en
 * la sesión de Clerk (cookie __session, hidratada por ClerkProvider).
 * Este store ya NO guarda accessToken ni maneja el bootstrap de sesión.
 *
 * Lo que queda: un store vacío que exporta `useAuthStore` y el hook `authToken`
 * para compatibilidad con imports existentes que todavía no se migraron, pero
 * sin lógica real (getToken/setToken ya no se usan para el admin).
 *
 * Para acceder al usuario: usar `useUser()` de `@clerk/nextjs`.
 * Para logout:             usar `useClerk().signOut()` de `@clerk/nextjs`.
 * Para el token Bearer:    ver `apps/admin/lib/api.ts` (usa window.Clerk).
 */

import { create } from 'zustand'

// El store de auth del admin está ahora vacío de lógica real.
// Se mantiene para que imports de `useAuthStore` no fallen mientras se migran
// los componentes que lo usaban (sidebar, notification-bell, setter-view).
// Una vez que esos componentes lean de Clerk directamente, este store puede
// eliminarse por completo.
interface AuthState {
  _placeholder: null
}

export const useAuthStore = create<AuthState>(() => ({
  _placeholder: null,
}))

/**
 * @deprecated Usar window.Clerk (ver lib/api.ts) o `useAuth()` de @clerk/nextjs.
 * Mantenido para que imports de `authToken` no fallen antes de la migración total.
 * get() siempre devuelve null — los requests van por el getter async de Clerk.
 */
export const authToken = {
  get: (): string | null => null,
  set: (_t: string): void => { /* no-op con Clerk */ },
  clear: (): void => { /* no-op con Clerk */ },
}
