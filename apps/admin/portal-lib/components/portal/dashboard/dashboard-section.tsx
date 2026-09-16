'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { Button } from '@portal/components/ui/button'

/**
 * Cromo compartido de las secciones del Inicio: el encabezado (eyebrow + un
 * dato o link a la derecha) y el estado de error.
 *
 * Existe para que las cuatro secciones —proyecto, atención, avances,
 * actividad— no repitan cada una su propio `<h2 className="eyebrow">` con
 * márgenes ligeramente distintos. El espaciado ENTRE secciones lo pone el
 * contenedor del Inicio, no cada sección: así hay un solo lugar donde ese
 * ritmo se define.
 */
export function DashboardSection({
  id,
  title,
  aside,
  children,
  className,
}: {
  /** Ancla el `aria-labelledby` del `<section>` al título. */
  id: string
  title: string
  /** Dato a la derecha del título: un contador, un link a la sección completa. */
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="eyebrow">
          {title}
        </h2>
        {aside && <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Link "Ver todo →" del encabezado de una sección. Es un link real (navega),
 * no un botón: el destino es una URL y tiene que poder abrirse en otra pestaña.
 */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 rounded-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
      <ArrowRight
        aria-hidden
        className="h-3 w-3 transition-transform motion-safe:group-hover:translate-x-0.5"
        strokeWidth={2}
      />
    </Link>
  )
}

/**
 * Error de UNA sección. El Inicio no se cae entero porque falle una request
 * secundaria: cada sección resuelve el suyo y el resto de la pantalla sigue
 * siendo útil. `onRetry` es el `refetch` de la query correspondiente — un
 * reintento puntual, sin recargar la página ni volver a pedir lo que ya cargó.
 */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="self-start sm:self-auto">
        Reintentar
      </Button>
    </div>
  )
}
