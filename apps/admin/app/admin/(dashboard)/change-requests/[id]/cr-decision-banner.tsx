import { AlertTriangle, XCircle } from 'lucide-react'
import { CR_REJECTION_REASON_LABEL, CR_ADJUSTMENT_AREA_LABEL, type CRAdjustmentArea } from '@synous/shared'
import type { ChangeRequest, CREvent } from '@/lib/types'

/**
 * Si el cliente rechazó la CR o pidió un ajuste, es lo PRIMERO que el equipo
 * necesita ver — antes que la descripción, antes que la propuesta. Se muestra
 * arriba de todo el contenido, debajo del header.
 *
 * El motivo de rechazo sale directo de la columna (`decisionReason` /
 * `decisionComment`); el área del ajuste sale del evento `adjustment_requested`
 * más reciente porque esa columna no vive en el registro de la CR.
 */
export function CRDecisionBanner({ cr, events }: { cr: ChangeRequest; events: CREvent[] }) {
  // Los dos `if` de acá abajo comparan contra el string literal del estado, NO
  // contra el catálogo (`CHANGE_REQUEST_STATUS_META`/`waitingOn`) a propósito:
  // este banner es específico de ESTOS DOS estados puntuales (el cliente
  // rechazó / pidió un ajuste), no de una categoría más amplia como
  // "waitingOn: agency" — 'negotiating' comparte esa categoría con
  // 'under_review', que no dispara ningún banner. Derivar esto del catálogo
  // obligaría a inventar un campo nuevo (`showsDecisionBanner`) que solo esta
  // pantalla usaría; el string explícito es más claro que esa abstracción.
  if (cr.status === 'rejected') {
    const reasonLabel = cr.decisionReason ? CR_REJECTION_REASON_LABEL[cr.decisionReason] : null
    return (
      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-[rgba(248,113,113,0.25)] dark:bg-[rgba(248,113,113,0.1)]">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-[rgba(252,165,165,0.9)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800 dark:text-[rgba(252,165,165,0.95)]">
              El cliente rechazó esta solicitud
              {reasonLabel ? ` — motivo: ${reasonLabel}` : ''}
            </p>
            {cr.decisionComment && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-red-700 dark:text-[rgba(252,165,165,0.8)]">
                {cr.decisionComment}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (cr.status === 'negotiating') {
    const lastAdjustment = [...events]
      .reverse()
      .find((e) => e.eventType === 'adjustment_requested')
    const area = lastAdjustment?.metadata?.area as CRAdjustmentArea | undefined
    const areaLabel = area ? CR_ADJUSTMENT_AREA_LABEL[area] : null

    return (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.1)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-[rgba(253,224,71,0.9)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-[rgba(253,224,71,0.95)]">
              El cliente pidió un ajuste{areaLabel ? ` de ${areaLabel.toLowerCase()}` : ''}
            </p>
            {(lastAdjustment?.comment ?? cr.decisionComment) && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-700 dark:text-[rgba(253,224,71,0.8)]">
                {lastAdjustment?.comment ?? cr.decisionComment}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
