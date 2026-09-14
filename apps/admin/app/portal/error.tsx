'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Card, CardContent } from '@portal/components/ui/card'

/**
 * Error boundary del Portal de cliente. Vive en `app/portal/` (fuera del
 * grupo `(app)`), así que el `layout.tsx` padre — que sí sigue montado — ya
 * puso `.portal-theme` + `Providers` (QueryClient + BrandingProvider) en el
 * árbol. No usamos `useBranding()` a propósito: aunque el context tiene un
 * default seguro (`{ brand: null, apply: () => {} }`) y nunca tira, esta
 * pantalla es un fallback de error — mejor copy neutro y sin depender de que
 * la marca del cliente haya cargado.
 *
 * Tampoco usamos `EmptyIllustration` de portal-lib: ese componente hardcodea
 * colores oscuros pensados SOLO para `.portal-editorial` (el shell de
 * `(app)/layout.tsx`), que no envuelve esta ruta — se vería un tile oscuro
 * flotando sobre el fondo claro del tema Fynix.
 */
export default function PortalError({
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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="text-sm text-muted-foreground">
            Ocurrió un error inesperado. Probá de nuevo en unos segundos.
          </p>
          <div className="mt-2 flex flex-col items-center gap-2">
            <Button size="sm" onClick={() => reset()}>Reintentar</Button>
            <Link href="/portal" className="text-sm text-primary underline underline-offset-4">
              ← Volver al inicio
            </Link>
          </div>
          {error.digest && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
              Referencia: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
