'use client'

/**
 * Providers del segmento /admin (CRM — hub_user).
 *
 * Con Clerk como auth provider, ya no existe el "bootstrap" de sesión vía
 * /api/auth/refresh: Clerk maneja la hidratación de sesión de forma transparente
 * a través del ClerkProvider (en el root layout) y las cookies __session.
 *
 * Este providers.tsx provee el QueryClient de TanStack Query + el manejo GLOBAL
 * de errores de red (ver más abajo).
 */

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
  keepPreviousData,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'

/**
 * Mensaje legible para el usuario a partir de un error de red.
 * `ApiError` ya trae el mensaje que devolvió la API; el resto cae a genérico.
 */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Ocurrió un error inesperado'
}

/**
 * Un 401 no se le muestra al usuario: el api-client ya dispara `onAuthFailure`
 * y redirige a /admin/login. Un toast acá solo alcanzaría a parpadear durante
 * la redirección.
 */
function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Toda query fallida avisa. Sin esto, un endpoint caído (o inexistente)
        // se ve idéntico a "no hay datos" y puede pasar meses sin que nadie lo
        // note — fue exactamente lo que ocurrió con /contacts/:id/next-action.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (isAuthError(error)) return
            // El id estable por queryKey evita que una query que reintenta
            // apile un toast por intento: el nuevo reemplaza al anterior.
            toast.error(errorMessage(error), { id: `q:${JSON.stringify(query.queryKey)}` })
          },
        }),
        // Las mutaciones que ya traen su propio `onError` (rollback optimista,
        // toast a medida) se respetan tal cual: el global solo cubre las que
        // hoy fallan en silencio.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (isAuthError(error)) return
            if (mutation.options.onError) return
            toast.error(errorMessage(error))
          },
        }),
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
