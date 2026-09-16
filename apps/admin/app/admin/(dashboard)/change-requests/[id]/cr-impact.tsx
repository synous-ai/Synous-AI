import type { ChangeRequest } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Impacto económico y temporal — bien legible, en tiles grandes (mismo
 * lenguaje visual que la tarjeta "Montos" de facturas). Refleja los valores
 * VIGENTES en la CR (el backend los actualiza cuando se acepta una propuesta).
 */
export function CRImpact({ cr }: { cr: ChangeRequest }) {
  const days = cr.timelineImpactDays
  const daysLabel = days === 0 ? 'Sin impacto en plazo' : days > 0 ? `+${days} días` : `${days} días`

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Impacto</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Monto</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {cr.totalAmount ? formatCurrency(cr.totalAmount, cr.currency) : '—'}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Impacto en plazo</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{daysLabel}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Nueva fecha de entrega</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {cr.newDeliveryDate ? formatDate(cr.newDeliveryDate) : '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
