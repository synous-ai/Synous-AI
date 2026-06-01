'use client'

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apiPost } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import type { User } from '@/lib/types'

function AuthBootstrap({ children }: { children: ReactNode }) {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        // Restaura sesión usando el refresh token (cookie httpOnly).
        const res = await apiPost<{ accessToken: string; user: User }>('/api/auth/refresh', undefined, { skipAuth: true })
        useAuthStore.getState().setAuth(res.accessToken, res.user)
      } catch {
        // sin sesión activa
      } finally {
        useAuthStore.getState().setBootstrapped()
      }
    })()
  }, [])
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 300_000, // 5 min: revisitar una vista es instantáneo (sin skeleton)
            gcTime: 600_000, // 10 min en cache antes de descartar
            // Mantiene los datos previos mientras carga la nueva clave (id/filtro/página)
            // → al cambiar de vista no aparece un flash de skeleton.
            placeholderData: keepPreviousData,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>{children}</AuthBootstrap>
    </QueryClientProvider>
  )
}
