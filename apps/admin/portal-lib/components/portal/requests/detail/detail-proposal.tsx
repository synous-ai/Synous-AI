import { formatCurrency, formatDate } from '@synous/shared'
import type { CRProposal } from '@portal/lib/types'

function ProposalFacts({ proposal, currency }: { proposal: CRProposal; currency: string }) {
  const hasAny =
    proposal.amount != null ||
    (proposal.timelineImpactDays != null && proposal.timelineImpactDays > 0) ||
    proposal.newDeliveryDate != null
  if (!hasAny) return null

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {proposal.amount != null && (
        <div>
          <dt className="text-xs text-muted-foreground">Costo adicional</dt>
          <dd className="text-sm font-semibold text-foreground">{formatCurrency(proposal.amount, currency)}</dd>
        </div>
      )}
      {proposal.timelineImpactDays != null && proposal.timelineImpactDays > 0 && (
        <div>
          <dt className="text-xs text-muted-foreground">Impacto en plazo</dt>
          <dd className="text-sm font-semibold text-foreground">
            +{proposal.timelineImpactDays} día{proposal.timelineImpactDays !== 1 ? 's' : ''}
          </dd>
        </div>
      )}
      {proposal.newDeliveryDate && (
        <div>
          <dt className="text-xs text-muted-foreground">Nueva fecha de entrega</dt>
          <dd className="text-sm font-semibold text-foreground">{formatDate(proposal.newDeliveryDate)}</dd>
        </div>
      )}
    </dl>
  )
}

/**
 * Propuesta vigente + su impacto. Si la CR ya está aprobada, la que manda es
 * `approvedProposal` (puede no ser la última versión enviada, si hubo una
 * negociación posterior a la aprobación en el historial) — nunca
 * `currentProposal` a secas, para no mostrarle al cliente un número distinto
 * del que efectivamente aceptó.
 */
export function DetailProposal({
  currentProposal,
  approvedProposal,
  currency,
}: {
  currentProposal: CRProposal | null
  approvedProposal: CRProposal | null
  currency: string
}) {
  if (!currentProposal && !approvedProposal) return null

  const primary = approvedProposal ?? currentProposal!
  const title = approvedProposal ? 'Propuesta aprobada' : 'Propuesta / impacto'
  const showBothNote = approvedProposal != null && currentProposal != null && currentProposal.id !== approvedProposal.id

  return (
    <section aria-labelledby="cr-proposal-title" className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="cr-proposal-title" className="eyebrow">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">v{primary.version}</span>
      </div>

      {primary.scope && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{primary.scope}</p>}

      <ProposalFacts proposal={primary} currency={currency} />

      {showBothNote && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Esta es la versión que aprobaste (v{approvedProposal!.version}) — no necesariamente la última enviada.
        </p>
      )}
    </section>
  )
}
