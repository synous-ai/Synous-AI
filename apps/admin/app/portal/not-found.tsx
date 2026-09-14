'use client'

import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Card, CardContent } from '@portal/components/ui/card'

/**
 * 404 del Portal de cliente — ver `error.tsx` en este mismo directorio para
 * el porqué de no usar `EmptyIllustration` ni `useBranding()` acá.
 */
export default function PortalNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <FileQuestion className="h-8 w-8 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold">Esta página no existe</h1>
          <p className="text-sm text-muted-foreground">
            Revisá el enlace o volvé al inicio del portal.
          </p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/portal">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
