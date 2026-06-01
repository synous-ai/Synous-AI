import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  accessToken: string | null
  user: User | null
  /** true hasta que termina el bootstrap de sesión inicial. */
  bootstrapping: boolean
  setAuth: (token: string, user: User) => void
  setToken: (token: string) => void
  clear: () => void
  setBootstrapped: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: true,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null, user: null }),
  setBootstrapped: () => set({ bootstrapping: false }),
}))

/** Acceso al token fuera de React (para el cliente API). */
export const authToken = {
  get: () => useAuthStore.getState().accessToken,
  set: (t: string) => useAuthStore.getState().setToken(t),
  clear: () => useAuthStore.getState().clear(),
}
