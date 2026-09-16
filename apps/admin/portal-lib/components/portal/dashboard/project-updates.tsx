'use client'

import { formatDate } from '@synous/shared'
import type { ClientProjectUpdate } from '@portal/lib/types'
import { Badge } from '@portal/components/ui/badge'
import { DashboardSection } from '@portal/components/portal/dashboard/dashboard-section'

/**
 * "Últimos avances" — comunicación INTENCIONAL del equipo hacia el cliente.
 *
 * Son filas de `project_update`: mensajes que alguien del equipo escribió y
 * publicó a mano desde el detalle del deal (tab "Novedades"). No son eventos
 * del sistema — eso es "Actividad reciente", que sale de las notificaciones y
 * las genera el propio producto. Los dos conceptos viven en tablas distintas y
 * acá se muestran en secciones distintas, con jerarquía distinta: un avance
 * escrito por una persona pesa más que un evento automático.
 *
 * Los datos llegan dentro de `GET /api/client/project` (campo `updates`), así
 * que esta sección no dispara ninguna request propia: recibe lo que el
 * proyecto ya trajo.
 */

/** Cuántos avances se muestran en el Inicio. El backend ya devuelve hasta 20. */
const VISIBLE_UPDATES = 3

function UpdateItem({ update }: { update: ClientProjectUpdate }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:gap-4">
      {/* La fecha primero en desktop: hace de columna de referencia para
          escanear la lista sin leer el cuerpo de cada avance. */}
      <div className="flex shrink-0 items-center gap-2 sm:w-24 sm:flex-col sm:items-start sm:gap-1">
        <time dateTime={update.createdAt} className="eyebrow">
          {formatDate(update.createdAt, { day: 'numeric', month: 'short' })}
        </time>
        {update.phaseLabel && (
          <Badge variant="muted" className="text-[10px] font-normal">
            {update.phaseLabel}
          </Badge>
        )}
      </div>
      <p className="min-w-0 text-sm leading-relaxed text-foreground">{update.body}</p>
    </li>
  )
}

export function ProjectUpdates({ updates }: { updates: ClientProjectUpdate[] }) {
  const shown = updates.slice(0, VISIBLE_UPDATES)

  return (
    <DashboardSection id="dashboard-updates" title="Últimos avances">
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm text-muted-foreground">
          Todavía no hay novedades. El equipo va a publicar acá los avances importantes de tu proyecto.
        </p>
      ) : (
        <ul className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
          {shown.map((update) => (
            <UpdateItem key={update.id} update={update} />
          ))}
        </ul>
      )}
    </DashboardSection>
  )
}
