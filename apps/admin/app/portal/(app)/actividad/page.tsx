'use client'

/**
 * Actividad completa del cliente.
 *
 * Existe porque el Inicio muestra solo los 5 eventos más recientes y su "Ver
 * toda" necesitaba un destino real: la campana del header también corta en 20
 * y se cierra al navegar, así que hasta acá no había ninguna forma de
 * reconstruir qué pasó en el proyecto más allá de lo último.
 *
 * Usa `useClientActivity` (50 eventos) y no el hook de la campana (20): esta
 * pantalla existe para mirar más atrás que el Inicio.
 *
 * NO es una sección del sidebar a propósito (igual que `/marca`): es una vista
 * de consulta a la que se llega desde el Inicio, no un lugar donde el cliente
 * tenga algo que hacer. `sectionFrom` devuelve `null` para esta ruta y el rail
 * no marca ninguna sección activa, en vez de resaltar Inicio mintiendo.
 */

import { useClientActivity } from '@portal/lib/hooks'
import { SectionHeader } from '@portal/components/portal/section-header'
import { ActivityItem } from '@portal/components/portal/dashboard/activity-item'
import { SectionError } from '@portal/components/portal/dashboard/dashboard-section'
import { ActivitySkeleton } from '@portal/components/portal/dashboard/dashboard-skeletons'

export default function ActivityPage() {
  const { data, isLoading, isError, refetch } = useClientActivity()
  const items = data ?? []

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Tu proyecto"
        title="Actividad"
        description="Todo lo que fue pasando en tu proyecto, de lo más reciente a lo más antiguo."
      />

      {isLoading ? (
        <ActivitySkeleton count={8} />
      ) : isError ? (
        <SectionError message="No pudimos cargar la actividad." onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm text-muted-foreground">
          Todavía no hay actividad. Acá vas a ver lo que vaya pasando en tu proyecto.
        </p>
      ) : (
        <ul className="pl-0.5">
          {items.map((n, i) => (
            <ActivityItem key={n.id} notification={n} isLast={i === items.length - 1} />
          ))}
        </ul>
      )}
    </div>
  )
}
