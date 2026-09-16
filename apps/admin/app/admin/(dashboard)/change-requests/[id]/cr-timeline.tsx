import { History } from 'lucide-react'
import {
  CR_ADJUSTMENT_AREA_LABEL,
  CR_EVENT_LABEL,
  CR_REJECTION_REASON_LABEL,
  type CRAdjustmentArea,
  type CRRejectionReason,
} from '@synous/shared'
import type { CREvent } from '@/lib/types'
import { crStatus } from '@/lib/status'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const ACTOR_LABEL: Record<string, string> = {
  admin: 'Equipo',
  client: 'Cliente',
  system: 'Sistema',
}

/** Detalle adicional específico de cada tipo de evento, leído desde `metadata`. */
function EventDetail({ event }: { event: CREvent }) {
  const m = event.metadata ?? {}

  if (event.eventType === 'proposal_sent' || event.eventType === 'proposal_updated') {
    const version = typeof m.version === 'number' ? m.version : undefined
    const amount = typeof m.amount === 'string' || typeof m.amount === 'number' ? m.amount : undefined
    const currency = typeof m.currency === 'string' ? m.currency : undefined
    const days = typeof m.timelineImpactDays === 'number' ? m.timelineImpactDays : undefined
    if (version == null && amount == null && days == null) return null
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {version != null && `Versión ${version}`}
        {amount != null && ` · ${formatCurrency(amount, currency)}`}
        {days != null && days !== 0 && ` · ${days > 0 ? `+${days}` : days} días`}
      </p>
    )
  }

  if (event.eventType === 'adjustment_requested') {
    const area = typeof m.area === 'string' ? (m.area as CRAdjustmentArea) : undefined
    if (!area) return null
    return <p className="mt-1 text-xs text-muted-foreground">Área: {CR_ADJUSTMENT_AREA_LABEL[area] ?? area}</p>
  }

  if (event.eventType === 'rejected') {
    const reason = typeof m.reason === 'string' ? (m.reason as CRRejectionReason) : undefined
    if (!reason) return null
    return <p className="mt-1 text-xs text-muted-foreground">Motivo: {CR_REJECTION_REASON_LABEL[reason] ?? reason}</p>
  }

  return null
}

/**
 * Timeline construido a partir de `events` (eventType + metadata estructurada),
 * NUNCA de texto preformateado — así una propuesta enviada muestra su
 * monto/días/versión reales, no una frase armada a mano.
 */
export function CRTimeline({ events }: { events: CREvent[] }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Historial ({events.length})</p>
        {events.length === 0 ? (
          <Empty className="border-dashed py-6">
            <EmptyHeader>
              <EmptyIllustration icon={History} />
              <EmptyTitle>Sin historial todavía</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="space-y-3">
            {[...events]
              .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
              .map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{CR_EVENT_LABEL[e.eventType]?.admin ?? e.eventType}</span>
                      {e.fromStatus && e.toStatus && (
                        <>
                          {(() => {
                            const from = crStatus(e.fromStatus)
                            const to = crStatus(e.toStatus)
                            return (
                              <>
                                <StatusBadge kind={from.kind}>{from.label}</StatusBadge>
                                <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>
                                <StatusBadge kind={to.kind}>{to.label}</StatusBadge>
                              </>
                            )
                          })()}
                        </>
                      )}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {ACTOR_LABEL[e.actorRole] ?? e.actorRole}{e.actorName ? ` · ${e.actorName}` : ''} · {formatDate(e.changedAt)}
                      </span>
                    </div>
                    <EventDetail event={e} />
                    {e.comment && <p className="mt-1 text-xs text-muted-foreground">{e.comment}</p>}
                  </div>
                </li>
              ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
