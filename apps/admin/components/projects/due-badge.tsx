import { CalendarClock } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { daysUntil, formatDateOnly } from '@/lib/projects'

/**
 * Vencimiento compartido por tarjetas, tablas y kanban.
 *  - `done` (entregado / completada): neutro, con la fecha.
 *  - vencida: "Vencido" (danger).
 *  - faltan 7 días o menos: "Urgente" (warning).
 *  - resto: la fecha, neutra.
 * `date` puede ser 'YYYY-MM-DD' o un ISO (se usa solo el día de calendario).
 */
export function DueBadge({
  date,
  done = false,
  className,
}: {
  date: string | null | undefined
  done?: boolean
  className?: string
}): React.JSX.Element | null {
  if (!date) return null
  const full = formatDateOnly(date, true)
  const short = formatDateOnly(date)
  const days = daysUntil(date)

  let kind: 'neutral' | 'danger' | 'warning' = 'neutral'
  let label = short
  if (!done) {
    if (days < 0) {
      kind = 'danger'
      label = 'Vencido'
    } else if (days <= 7) {
      kind = 'warning'
      label = 'Urgente'
    }
  }

  return (
    <StatusBadge kind={kind} className={className}>
      <span title={`Vence: ${full}`} className="inline-flex items-center gap-1">
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        {label}
        <span className="sr-only">{`, vence ${full}`}</span>
      </span>
    </StatusBadge>
  )
}
