import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonGroup } from '@/components/ui/loading-region'

/**
 * Fallback de Suspense COMPARTIDO por todo el grupo (dashboard): se muestra al
 * navegar a CUALQUIER sección (pipeline, deals, finance, calendar, tasks…) que
 * todavía no montó su propio skeleton fiel.
 *
 * Por eso es NEUTRO a propósito — NO imita ninguna pantalla concreta. Antes
 * imitaba el dashboard (KPIs + charts + tablas), y como este loading.tsx es el
 * fallback de TODAS las rutas hijas, al entrar a pipeline/deals/etc. se veía el
 * skeleton del dashboard y enseguida el de la sección → dos skeletons mezclados.
 *
 * Cada página renderiza su skeleton fiel al montar; este solo cubre el instante
 * de transición de ruta con un encabezado + una superficie neutra.
 */
export default function DashboardLoading() {
  return (
    <SkeletonGroup label="Cargando…" className="space-y-6 p-6">
      {/* Encabezado de página — patrón común a todas las secciones */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      {/* Cuerpo neutro: una superficie única, sin imitar tabla/kanban/dashboard */}
      <Skeleton className="h-[55vh] w-full rounded-xl" />
    </SkeletonGroup>
  )
}
