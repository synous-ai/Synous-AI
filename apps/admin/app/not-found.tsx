'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * 404 de raíz: cubre cualquier ruta que no matchee ningún segmento de la app
 * (admin, portal, book, p, o cualquier URL inventada). Por eso es neutro a
 * propósito — no asume que el usuario venga del admin ni del portal.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Esta página no existe</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Revisá la dirección o volvé al inicio.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  )
}
