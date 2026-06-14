'use client'

/**
 * Providers del segmento /admin (CRM — hub_user).
 *
 * Con Clerk como auth provider, ya no existe el "bootstrap" de sesión vía
 * /api/auth/refresh: Clerk maneja la hidratación de sesión de forma transparente
 * a través del ClerkProvider (en el root layout) y las cookies __session.
 *
 * Este providers.tsx solo provee el QueryClient de TanStack Query.
 */

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
