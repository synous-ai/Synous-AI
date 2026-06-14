import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/ui/skeletons'
import { SkeletonGroup } from '@/components/ui/loading-region'

/**
 * Fallback de Suspense para TODO el dashboard. Su sola existencia hace que las
 * navegaciones se commiteen al instante (la URL cambia y el sidebar se marca
 * seleccionado de inmediato) mostrando este esqueleto mientras carga el segmento,
 * en vez de quedar bloqueadas esperando a la API.
 *
 * Layout idéntico al dashboard real para CLS ≈ 0:
 *  - 4 KPI cards: grid-cols-2 lg:grid-cols-4
 *  - Chart 2/3 + Calendario 1/3: grid-cols-1 lg:grid-cols-3
 *  - 2 tablas (deals + tareas): grid-cols-1 lg:grid-cols-2 con thead simulado
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Título */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>

      {/* 4 KPI cards — igual que el real: grid-cols-2 lg:grid-cols-4 */}
      <SkeletonGroup label="Cargando métricas…" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </SkeletonGroup>

      {/* Chart 2/3 + Calendario 1/3 */}
      <SkeletonGroup
        label="Cargando gráfico y calendario…"
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        {/* Chart simulado con barras escalonadas */}
        <div className="rounded-xl border bg-card p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex items-end gap-2 h-[200px] px-2">
            {[65, 90, 40, 75, 55, 80, 45, 95].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        {/* Calendario simulado */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 rounded" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: 7 }).map((_, col) => (
                <Skeleton key={col} className="h-7 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </SkeletonGroup>

      {/* 2 tablas con thead simulado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-5 border-b space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <TableSkeleton columns={3} rows={4} label="Cargando deals…" className="border-0 rounded-none" />
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-5 border-b space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <TableSkeleton columns={3} rows={4} label="Cargando tareas…" className="border-0 rounded-none" />
        </div>
      </div>
    </div>
  )
}
