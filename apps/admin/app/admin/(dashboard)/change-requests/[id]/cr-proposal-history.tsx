import { FileStack } from 'lucide-react'
import type { CRProposal } from '@/lib/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import type { StatusKind } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const PROPOSAL_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  draft: { kind: 'neutral', label: 'Borrador' },
  sent: { kind: 'info', label: 'Enviada' },
  superseded: { kind: 'neutral', label: 'Reemplazada' },
  accepted: { kind: 'success', label: 'Aceptada' },
  rejected: { kind: 'danger', label: 'Rechazada' },
}

/**
 * Historial de versiones de propuesta — la aceptada queda resaltada.
 *
 * Los estados de PROPUESTA (draft/sent/superseded/accepted/rejected) son un
 * sub-dominio propio (`CRProposalStatus`), distinto de `ChangeRequestStatus`
 * de la CR — por eso el mapeo de tono vive acá y no en `lib/status.ts`.
 */
export function CRProposalHistory({
  proposals,
  approvedProposalId,
}: {
  proposals: CRProposal[]
  approvedProposalId: string | null
}) {
  if (proposals.length === 0) {
    return (
      <Empty className="border-dashed py-6">
        <EmptyHeader>
          <EmptyIllustration icon={FileStack} />
          <EmptyTitle>Todavía no hay propuestas</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  const sorted = [...proposals].sort((a, b) => b.version - a.version)

  return (
    <ol className="space-y-2">
      {sorted.map((p) => {
        const meta = PROPOSAL_STATUS[p.status] ?? { kind: 'neutral' as StatusKind, label: p.status }
        const isApproved = p.id === approvedProposalId
        return (
          <li
            key={p.id}
            className={cn(
              'rounded-xl border px-3 py-2.5',
              isApproved ? 'border-emerald-300 bg-emerald-50/60 dark:border-[rgba(34,255,153,0.3)] dark:bg-[rgba(34,255,153,0.06)]' : 'bg-background/60',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">v{p.version}</span>
              <StatusBadge kind={meta.kind}>{meta.label}</StatusBadge>
              {isApproved && <StatusBadge kind="success">Aceptada por el cliente</StatusBadge>}
              {p.amount && (
                <span className="font-mono text-xs font-semibold text-foreground">
                  {formatCurrency(p.amount, p.currency)}
                </span>
              )}
              {p.timelineImpactDays != null && p.timelineImpactDays !== 0 && (
                <span className="text-xs text-muted-foreground">
                  {p.timelineImpactDays > 0 ? `+${p.timelineImpactDays}` : p.timelineImpactDays} días
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {p.sentAt ? `Enviada ${formatDate(p.sentAt)}` : `Creada ${formatDate(p.createdAt)}`}
              </span>
            </div>
            {p.scope && <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{p.scope}</p>}
            {p.note && (
              <p className="mt-1 whitespace-pre-wrap text-xs italic text-muted-foreground/80">“{p.note}”</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
