import { CHANGE_REQUEST_TERMINAL_STATUSES } from '@synous/shared'
import type { ChangeRequest, CRProposal } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { CRProposalComposer } from './cr-proposal-composer'
import { CRProposalHistory } from './cr-proposal-history'

/**
 * "Nuestra propuesta" — composer (cuando la CR sigue viva) + historial de
 * versiones. Separado visualmente de CRClientRequest a propósito: acá está
 * lo que el EQUIPO ofrece, no lo que el cliente pidió.
 */
export function CRProposalSection({
  id,
  cr,
  proposals,
  draftProposal,
  approvedProposal,
}: {
  id: string
  cr: ChangeRequest
  proposals: CRProposal[]
  draftProposal: CRProposal | null
  approvedProposal: CRProposal | null
}) {
  const isTerminal = CHANGE_REQUEST_TERMINAL_STATUSES.includes(cr.status)

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Nuestra propuesta</p>

        {!isTerminal && <CRProposalComposer id={id} cr={cr} draftProposal={draftProposal} />}

        <div className={isTerminal ? '' : 'mt-4'}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial de versiones ({proposals.length})
          </p>
          <CRProposalHistory proposals={proposals} approvedProposalId={approvedProposal?.id ?? null} />
        </div>
      </CardContent>
    </Card>
  )
}
