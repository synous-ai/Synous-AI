import { SkeletonGroup } from '@/components/ui/loading-region'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton, ListSkeleton } from '@/components/ui/skeletons'

/**
 * Skeleton fiel al layout real del detalle de CR: header + banner opcional +
 * 2 columnas (izq: pedido del cliente + propuesta + impacto + archivos +
 * comentarios + historial / der: acciones + vínculos). Imita dimensiones
 * reales para CLS ≈ 0 — ver guía de skeletons en `components/ui/skeletons.tsx`.
 */
export function CRDetailSkeleton() {
  return (
    <SkeletonGroup label="Cargando change request…">
      {/* Header card */}
      <div className="mb-6 space-y-2 rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Izquierda */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className="space-y-2 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-16" />
            <TableSkeleton columns={3} rows={2} label="Cargando impacto…" />
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-20" />
            <ListSkeleton rows={2} rowClassName="h-12 rounded-xl" label="Cargando archivos…" />
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-24" />
            <ListSkeleton rows={3} rowClassName="h-16 rounded-xl" label="Cargando comentarios…" />
          </div>
        </div>

        {/* Derecha */}
        <div className="w-full space-y-6 lg:w-80 lg:flex-shrink-0">
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-16" />
            <ListSkeleton rows={2} rowClassName="h-10 rounded-lg" label="Cargando vínculos…" />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  )
}
