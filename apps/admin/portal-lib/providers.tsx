'use client'

// Providers del portal de cliente.
// CA2: AuthBootstrap (refresh JWT httpOnly) eliminado — Clerk gestiona la sesión.
// ClerkProvider ya envuelve toda la app en apps/admin/app/layout.tsx, así que
// no lo repetimos acá. Solo necesitamos QueryClient + BrandingProvider.

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { BrandingProvider } from '@portal/components/branding/branding-provider'

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
      <BrandingProvider>{children}</BrandingProvider>
    </QueryClientProvider>
  )
}
