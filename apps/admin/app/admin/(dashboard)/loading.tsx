import { Skeleton } from '@/components/ui/skeleton'

/**
 * Fallback de Suspense para TODO el dashboard. Su sola existencia hace que las
 * navegaciones se commiteen al instante (la URL cambia y el sidebar se marca
 * seleccionado de inmediato) mostrando este esqueleto mientras carga el segmento,
 * en vez de quedar bloqueadas esperando a la API.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  )
}
