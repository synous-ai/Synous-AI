'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Error boundary de la propuesta pública (`/p/[token]`). Prospect-facing:
 * copy neutro, sin detalles internos ni links al admin. Usa los tokens de
 * shadcn (`bg-background`, etc.) igual que `p/[token]/loading.tsx` — esta
 * ruta SÍ respeta el tema claro/oscuro del visitante (a diferencia de `/book`).
 */
export default function PublicProposalError({
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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-lg">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" strokeWidth={1.75} />
        <h1 className="mb-2 text-lg font-semibold text-foreground">No se pudo cargar la propuesta</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado. Probá de nuevo en unos segundos.
        </p>
        <Button size="sm" className="mt-5" onClick={() => reset()}>Reintentar</Button>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground/70">Referencia: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
