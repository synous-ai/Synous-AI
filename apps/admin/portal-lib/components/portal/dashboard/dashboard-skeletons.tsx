import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'

/**
 * Estados de carga del Inicio, uno por sección.
 *
 * Cada uno imita la ESTRUCTURA final —mismos altos, mismos radios, misma
 * grilla— para que al llegar los datos nada se mueva de lugar. Son por sección
 * y no uno solo para toda la pantalla porque las secciones cargan de fuentes
 * distintas: el proyecto puede estar listo mientras la actividad todavía
 * viaja, y en ese caso mostrar el proyecto ya sirve de algo.
 *
 * La accesibilidad la resuelve `SkeletonGroup`: anuncia el estado UNA vez en
 * el contenedor, y las barras de adentro son decorativas.
 */

/** "Tu proyecto": título + pill, stepper, descripción y grilla de metadata. */
export function ProjectOverviewSkeleton() {
  return (
    <SkeletonGroup label="Cargando el estado de tu proyecto…">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        {/* Stepper: vertical en mobile, riel horizontal desde `md`. */}
        <div className="mt-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-col gap-3 md:flex-row md:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 md:flex-1 md:flex-col md:gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-3 w-24 md:w-full" />
              </div>
            ))}
          </div>
        </div>

        <Skeleton className="mt-5 h-4 w-full max-w-prose" />

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonGroup>
  )
}

/** "Requiere tu atención": la misma grilla de 2 columnas que las tarjetas reales. */
export function ActionCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <SkeletonGroup label="Cargando lo que requiere tu atención…" className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ))}
    </SkeletonGroup>
  )
}

/** "Actividad reciente": punto + dos líneas por evento, igual que el timeline. */
export function ActivitySkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup label="Cargando la actividad reciente…" className="pl-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3 pb-4 last:pb-0">
          <Skeleton className="h-[22px] w-[22px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  )
}
