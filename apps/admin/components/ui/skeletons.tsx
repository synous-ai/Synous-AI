import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonGroup } from "@/components/ui/loading-region"

/**
 * Primitivos de skeleton FIELES al layout real, reutilizables en todo el admin.
 *
 * Regla de oro (guía de skeletons, punto 3): imitar estructura Y dimensiones del
 * contenido real para que el reemplazo skeleton → dato no mueva un píxel (CLS ≈ 0).
 * No esqueletizar lo estático (header/tabs/filtros): eso se renderiza ya.
 *
 * Cada primitivo es un <SkeletonGroup> (role=status + aria-busy + sr-only),
 * así el contenedor anuncia la carga una vez y las barras quedan ocultas.
 */

/**
 * TableSkeleton — imita una tabla con encabezado (thead) + N filas.
 * Reemplaza el antipatrón de "3 rectángulos h-12" que omite el thead y provoca
 * que el encabezado aparezca de golpe.
 */
export function TableSkeleton({
  columns = 4,
  rows = 6,
  label = "Cargando tabla…",
  className,
}: {
  columns?: number
  rows?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("overflow-hidden rounded-lg border", className)}
    >
      {/* Encabezado */}
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className="h-3.5 flex-1" />
        ))}
      </div>
      {/* Filas */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}

/**
 * KanbanSkeleton — imita un board kanban: scroll horizontal de columnas `w-72`.
 * Reemplaza el antipatrón de grilla vertical que no coincide con el `flex`
 * horizontal del board real (CLS severo al montar el kanban).
 */
export function KanbanSkeleton({
  columns = 4,
  cardsPerColumn = 3,
  label = "Cargando tablero…",
  className,
}: {
  columns?: number
  cardsPerColumn?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("flex gap-4 overflow-x-auto pb-4", className)}
    >
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-6" />
          </div>
          {Array.from({ length: cardsPerColumn }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}

/**
 * CardGridSkeleton — imita una grilla responsiva de cards.
 * Usar para listas que se renderizan como grilla (propuestas, prospección…).
 */
export function CardGridSkeleton({
  count = 6,
  label = "Cargando…",
  className,
  cardClassName,
}: {
  count?: number
  label?: string
  className?: string
  cardClassName?: string
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-24 rounded-xl", cardClassName)} />
      ))}
    </SkeletonGroup>
  )
}

/**
 * DetailViewSkeleton — imita el layout de detalle de 2 paneles (aside izq con
 * avatar + título + acciones + campos; panel der con tabs + contenido).
 * Reemplaza el antipatrón de "2 rectángulos h-96" copy-pasteado en 5 vistas de
 * detalle distintas (leads/contacts/clients/deals/companies).
 *
 * Los `tabs` se muestran como pills porque son la estructura del panel derecho;
 * si una vista los renderiza ya (estáticos), pasar `tabs={0}`.
 */
export function DetailViewSkeleton({
  fields = 5,
  tabs = 4,
  actions = 2,
  label = "Cargando detalle…",
  className,
}: {
  fields?: number
  tabs?: number
  actions?: number
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("flex flex-col gap-6 lg:flex-row", className)}
    >
      {/* Panel izquierdo */}
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        {actions > 0 ? (
          <div className="flex gap-2">
            {Array.from({ length: actions }).map((_, i) => (
              <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
            ))}
          </div>
        ) : null}
        <div className="space-y-3 pt-2">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </aside>
      {/* Panel derecho */}
      <div className="flex-1 space-y-4">
        {tabs > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: tabs }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        ) : null}
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </SkeletonGroup>
  )
}

/**
 * ListSkeleton — imita una lista vertical de filas/cards de alto uniforme
 * (timeline, follow-ups, event types, bookings…). Para listas que NO son tabla.
 */
export function ListSkeleton({
  rows = 5,
  rowClassName = "h-16 rounded-xl",
  label = "Cargando…",
  className,
}: {
  rows?: number
  rowClassName?: string
  label?: string
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </SkeletonGroup>
  )
}
