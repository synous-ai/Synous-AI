'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Error boundary de las páginas públicas de reserva (`/book/*`). Prospect-facing:
 * copy neutro, sin detalles internos ni links al admin. Sigue la MISMA paleta
 * hardcodeada (gray-*, sin dark mode) que el resto de `/book` — ver
 * `booking-skeletons.tsx` y `book/cancel/page.tsx`, que ya usan este patrón.
 */
export default function BookError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
        <h1 className="mb-2 text-xl font-bold text-gray-900">No se pudo cargar la página</h1>
        <p className="text-sm text-gray-500">
          Ocurrió un error inesperado. Probá de nuevo en unos segundos.
        </p>
        <button
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Reintentar
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-gray-400">Referencia: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
