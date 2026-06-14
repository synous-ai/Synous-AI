import { cn } from '@/lib/utils'
import { SkeletonGroup } from '@/components/ui/loading-region'

/**
 * Skeletons de las páginas públicas de reserva (book) y reprogramación (reschedule).
 *
 * Estas páginas usan una paleta neutra hardcodeada (bg-gray-50 / bg-white / grays),
 * NO los tokens de shadcn ni dark mode. Por eso las barras son `bg-gray-200` (no el
 * primitivo <Skeleton> con bg-primary/10): así el placeholder no desentona con la página.
 *
 * Carpeta `_components` → privada en App Router (no genera ruta).
 */

/** Barra gris decorativa (aria-hidden; el anuncio de carga lo hace <SkeletonGroup>). */
function Bar({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-gray-200', className)} />
}

/**
 * Calendario mensual: nav + encabezado de días + grilla 7×5 de círculos.
 * Imita la estructura real (grid-cols-7, días como `aspect-square rounded-full`).
 */
function CalendarMonthSkeleton() {
  return (
    <div className="mb-6">
      {/* Nav del mes */}
      <div className="mb-4 flex items-center justify-between">
        <Bar className="h-7 w-7 rounded-full" />
        <Bar className="h-4 w-28" />
        <Bar className="h-7 w-7 rounded-full" />
      </div>
      {/* Encabezado de días */}
      <div className="mb-1 grid grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-center py-1">
            <Bar className="h-3 w-6" />
          </div>
        ))}
      </div>
      {/* Grilla de días */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="flex aspect-square items-center justify-center">
            <Bar className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * SlotsSkeleton — grilla de horarios disponibles.
 * Misma estructura (`grid-cols-2 sm:grid-cols-3`) y misma altura de botón
 * (`px-3 py-2 text-sm` ≈ 38px) que la grilla real → reemplazo sin salto (CLS ≈ 0).
 * Reemplaza el spinner chico que colapsaba la altura del panel en cada cambio de día/TZ.
 */
export function SlotsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SkeletonGroup
      label="Cargando horarios disponibles…"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="h-[38px] rounded-lg" />
      ))}
    </SkeletonGroup>
  )
}

/**
 * BookingPageSkeleton — pantalla completa de reserva (book): layout de 2 columnas
 * `[320px_1fr]` (info del evento + calendario). Imita el contenedor real
 * (max-w-5xl, cards rounded-2xl) para no saltar al montar la página real.
 */
export function BookingPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <SkeletonGroup
          label="Cargando reserva…"
          className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]"
        >
          {/* Panel izquierdo: info del evento */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Bar className="h-3 w-3 rounded-full" />
              <Bar className="h-3 w-32" />
            </div>
            <Bar className="mb-4 h-7 w-3/4" />
            <Bar className="mb-2 h-4 w-28" />
            <Bar className="mb-4 h-4 w-40" />
            <div className="border-t pt-4">
              <Bar className="mb-2 h-3 w-24" />
              <Bar className="h-8 w-full rounded-md" />
            </div>
          </div>
          {/* Panel derecho: calendario */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <CalendarMonthSkeleton />
          </div>
        </SkeletonGroup>
      </div>
    </div>
  )
}

/**
 * ReschedulePageSkeleton — pantalla completa de reprogramación: una sola columna
 * `max-w-3xl` (header + calendario), acorde al layout real de reschedule.
 */
export function ReschedulePageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <SkeletonGroup label="Cargando reprogramación…" className="rounded-2xl bg-white p-6 shadow-sm">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <Bar className="h-3 w-3 rounded-full" />
            <div className="space-y-2">
              <Bar className="h-3 w-32" />
              <Bar className="h-5 w-48" />
            </div>
          </div>
          <Bar className="mb-6 h-4 w-28" />
          <CalendarMonthSkeleton />
        </SkeletonGroup>
      </div>
    </div>
  )
}
