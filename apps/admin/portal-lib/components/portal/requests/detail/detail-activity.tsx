import type { ElementType } from 'react'
import {
  Ban,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePlus2,
  MessageSquare,
  PenLine,
  PlusCircle,
  RefreshCcw,
  Send,
  XCircle,
} from 'lucide-react'
import { CR_ADJUSTMENT_AREA_LABEL, CR_EVENT_LABEL, CR_REJECTION_REASON_LABEL, formatDate } from '@synous/shared'
import { crClientLabel } from '@portal/components/portal/requests/cr-status'
import type { CREvent, CREventType } from '@portal/lib/types'

const EVENT_ICON: Record<CREventType, ElementType> = {
  created: PlusCircle,
  submitted: Send,
  review_started: Clock,
  proposal_sent: FilePlus2,
  proposal_updated: RefreshCcw,
  status_changed: RefreshCcw,
  comment_added: MessageSquare,
  attachment_added: FilePlus2,
  approved: CheckCircle2,
  rejected: XCircle,
  adjustment_requested: PenLine,
  cancelled: Ban,
  completed: FileCheck2,
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Motivo/área en `metadata` — vienen como el value del enum (`'cost'`), no el label. */
function labelOrRaw(dictionary: Record<string, string>, value: string): string {
  return dictionary[value] ?? value
}

/**
 * Texto del evento — SIEMPRE desde `CR_EVENT_LABEL[eventType].client`
 * (`@synous/shared`), nunca de un mapa local: admin y portal compartían antes
 * dos `Record<eventType, string>` paralelos de los mismos 13 eventos.
 *
 * Única excepción: `status_changed` con `fromStatus`/`toStatus` presentes se
 * enriquece con el detalle real de la transición — eso no es un mapa de
 * texto por evento, es composición de dos labels de ESTADO (`crClientLabel`,
 * también del catálogo) con los datos concretos de ese evento puntual. Quién
 * hizo cada cosa ("vos" vs "el equipo") no vive acá: sale de
 * `actorName`/`actorRole`, ya renderizado debajo del título en `EventRow`.
 */
function eventTitle(event: CREvent): string {
  if (event.eventType === 'status_changed' && event.fromStatus && event.toStatus) {
    return `Pasó de "${crClientLabel(event.fromStatus)}" a "${crClientLabel(event.toStatus)}"`
  }
  return CR_EVENT_LABEL[event.eventType]?.client ?? 'Actividad'
}

function EventRow({ event }: { event: CREvent }) {
  const Icon = EVENT_ICON[event.eventType] ?? Clock
  const reason = metadataString(event.metadata, 'reason')
  const area = metadataString(event.metadata, 'area')
  const tags = [area && labelOrRaw(CR_ADJUSTMENT_AREA_LABEL, area), reason && labelOrRaw(CR_REJECTION_REASON_LABEL, reason)].filter(
    (v): v is string => Boolean(v),
  )

  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-sm text-foreground">{eventTitle(event)}</p>
        {tags.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{tags.join(' · ')}</p>}
        {event.comment && <p className="mt-1 text-sm text-muted-foreground">“{event.comment}”</p>}
        <p className="mt-1 text-xs text-muted-foreground/70">
          {event.actorName ?? 'Equipo'} · {formatDate(event.changedAt)}
        </p>
      </div>
    </li>
  )
}

/** Timeline cronológico armado desde `eventType` + `metadata` estructurada — nunca desde texto preformateado. */
export function DetailActivity({ events }: { events: CREvent[] }) {
  if (events.length === 0) return null

  const sorted = [...events].sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt))

  return (
    <section aria-labelledby="cr-activity-title" className="space-y-3">
      <h2 id="cr-activity-title" className="eyebrow">
        Actividad
      </h2>
      <ol className="space-y-3 border-l border-border pl-4">
        {sorted.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ol>
    </section>
  )
}
