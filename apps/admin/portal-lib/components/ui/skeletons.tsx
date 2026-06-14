import { cn } from '@portal/lib/utils'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'

/**
 * CardListSkeleton — lista vertical de cards apiladas.
 * Imita el patrón de cards usado en deliverables, requests, forms, etc.
 * La card imita: header (título + badge) + body (línea corta).
 */
export function CardListSkeleton({
  count = 4,
  cardClassName = 'h-28',
  label = 'Cargando…',
  className,
}: {
  count?: number
  cardClassName?: string
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('rounded-xl border bg-card p-4 space-y-3', cardClassName)}>
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </SkeletonGroup>
  )
}

/**
 * RowListSkeleton — lista vertical de filas compactas.
 * Imita el patrón de InvoiceRow / DocumentRow:
 * número + badge izq, fechas centro, monto der.
 */
export function RowListSkeleton({
  count = 4,
  label = 'Cargando…',
  className,
}: {
  count?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={cn('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border bg-card px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </SkeletonGroup>
  )
}

/**
 * FormSkeleton — campo label + input por cada field.
 * Imita el patrón del BrandKitForm: label sobre input.
 */
export function FormSkeleton({
  fields = 4,
  label = 'Cargando formulario…',
  className,
}: {
  fields?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={cn('space-y-4', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
    </SkeletonGroup>
  )
}

/**
 * HomePanelSkeleton — grid 2 columnas de SummaryCards.
 * Cada SummaryCard: icon+título+badge arriba, descripción + botón abajo.
 */
export function HomePanelSkeleton({
  count = 4,
  label = 'Cargando resumen…',
  className,
}: {
  count?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={cn('space-y-4', className)}>
      <Skeleton className="h-3.5 w-64" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            {/* header: icon+title + badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            {/* description */}
            <Skeleton className="h-3 w-3/4" />
            {/* button */}
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}
