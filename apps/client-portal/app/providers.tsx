'use client'

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apiPost } from '@/lib/api'
import { useClientAuthStore } from '@/lib/store/auth'
import type { Client } from '@/lib/types'

function AuthBootstrap({ children }: { children: ReactNode }) {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        // Restaura sesión usando el refresh token del cliente (cookie httpOnly).
        const res = await apiPost<{ accessToken: string; client: Client }>(
          '/api/client-auth/refresh',
          undefined,
          { skipAuth: true },
        )
        useClientAuthStore.getState().setAuth(res.accessToken, res.client)
      } catch {
        // sin sesión activa
      } finally {
        useClientAuthStore.getState().setBootstrapped()
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
            staleTime: 300_000,
            gcTime: 600_000,
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
