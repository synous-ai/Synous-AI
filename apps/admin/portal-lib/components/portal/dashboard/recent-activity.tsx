'use client'

import { usePathname } from 'next/navigation'
import { useClientNotifications } from '@portal/lib/hooks'
import { portalBase } from '@portal/components/portal/portal-nav'
import { ActivityItem } from '@portal/components/portal/dashboard/activity-item'
import { DashboardSection, SectionError, SectionLink } from '@portal/components/portal/dashboard/dashboard-section'
import { ActivitySkeleton } from '@portal/components/portal/dashboard/dashboard-skeletons'

/**
 * "Actividad reciente" — la sección más liviana del Inicio.
 *
 * Es una línea de tiempo compacta, no una card por evento: son hechos para
 * escanear de un vistazo ("¿pasó algo desde la última vez que entré?"), y una
 * card por cada uno les daba el mismo peso visual que a una acción pendiente,
 * que es lo único que el cliente tiene que hacer algo al respecto.
 *
 * Reusa `useClientNotifications` (el mismo hook y la misma queryKey que la
 * campana del header): TanStack Query dedupe la request, así que esta sección
 * no suma un round-trip.
 */

/** Cuántos eventos entran en el Inicio antes de derivar a la actividad completa. */
const VISIBLE_EVENTS = 5

export function RecentActivity() {
  const pathname = usePathname()
  const { data, isLoading, isError, refetch } = useClientNotifications()

  if (isLoading) {
    return (
      <DashboardSection id="dashboard-activity" title="Actividad reciente">
        <ActivitySkeleton />
      </DashboardSection>
    )
  }

  if (isError) {
    return (
      <DashboardSection id="dashboard-activity" title="Actividad reciente">
        <SectionError message="No pudimos cargar la actividad reciente." onRetry={() => void refetch()} />
      </DashboardSection>
    )
  }

  const all = data ?? []
  const shown = all.slice(0, VISIBLE_EVENTS)

  return (
    <DashboardSection
      id="dashboard-activity"
      title="Actividad reciente"
      aside={
        all.length > shown.length ? (
          <SectionLink href={`${portalBase(pathname)}/actividad`}>Ver toda</SectionLink>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm text-muted-foreground">
          Todavía no hay actividad. Acá vas a ver lo que vaya pasando en tu proyecto.
        </p>
      ) : (
        <ul className="pl-0.5">
          {shown.map((n, i) => (
            <ActivityItem key={n.id} notification={n} isLast={i === shown.length - 1} />
          ))}
        </ul>
      )}
    </DashboardSection>
  )
}
