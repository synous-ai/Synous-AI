'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

/**
 * Error boundary del segmento (dashboard): cubre cualquier pantalla del CRM
 * (pipeline, deals, finance, calendar, etc.) que tire un error de render.
 * Vive DENTRO del shell del admin (Sidebar + Toaster siguen montados, los
 * provee el layout.tsx padre) — por eso alcanza con el contenido central.
 *
 * No exponemos `error.message` al usuario: puede filtrar detalles internos
 * (queries, stack de libs). Se loguea a consola — no hay infra de logging en
 * el frontend todavía.
 */
export default function DashboardError({
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
    <div className="p-6">
      <Empty className="border-dashed py-16">
        <EmptyHeader>
          <EmptyIllustration icon={AlertTriangle} />
          <EmptyTitle>Algo salió mal</EmptyTitle>
          <EmptyDescription>
            Ocurrió un error inesperado al cargar esta pantalla.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={() => reset()}>Reintentar</Button>
          <Link href="/dashboard" className="text-sm text-primary underline">
            ← Volver al dashboard
          </Link>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted-foreground/70">Referencia: {error.digest}</p>
          )}
        </EmptyContent>
      </Empty>
    </div>
  )
}
