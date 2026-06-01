import { create } from 'zustand'
import type { Client } from '../types'

interface ClientAuthState {
  accessToken: string | null
  client: Client | null
  /** true hasta que termina el bootstrap de sesión inicial. */
  bootstrapping: boolean
  setAuth: (token: string, client: Client) => void
  setToken: (token: string) => void
  clear: () => void
  setBootstrapped: () => void
}

export const useClientAuthStore = create<ClientAuthState>((set) => ({
  accessToken: null,
  client: null,
  bootstrapping: true,
  setAuth: (accessToken, client) => set({ accessToken, client }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null, client: null }),
  setBootstrapped: () => set({ bootstrapping: false }),
}))

/** Acceso al token fuera de React (para el cliente API). */
export const clientAuthToken = {
  get: () => useClientAuthStore.getState().accessToken,
  set: (t: string) => useClientAuthStore.getState().setToken(t),
  clear: () => useClientAuthStore.getState().clear(),
}
