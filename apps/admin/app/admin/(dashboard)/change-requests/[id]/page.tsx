'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useCRDetail } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { CRDetailSkeleton } from './cr-skeleton'
import { CRHeader } from './cr-header'
import { CRDecisionBanner } from './cr-decision-banner'
import { CRClientRequest } from './cr-client-request'
import { CRProposalSection } from './cr-proposal-section'
import { CRImpact } from './cr-impact'
import { CRAttachments } from './cr-attachments'
import { CRComments } from './cr-comments'
import { CRTimeline } from './cr-timeline'
import { CRActions } from './cr-actions'
import { CRLinks } from './cr-links'

export default function ChangeRequestDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data, isLoading, isError } = useCRDetail(id)
  const cr = data?.changeRequest

  // Shell común: breadcrumb + link a Deals no dependen de la request, se
  // renderizan desde el primer frame en los tres estados (cargando/error/ok).
  const shell = (children: React.ReactNode, crSlot: React.ReactNode) => (
    <div className="p-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={cr ? `/deals/${cr.dealId}` : '/deals'}
          className="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ChevronLeft className="h-4 w-4" />
          {cr ? 'Deal' : 'Deals'}
        </Link>
        <span aria-hidden="true">/</span>
        {crSlot}
      </nav>
      {children}
    </div>
  )

  if (isLoading) return shell(<CRDetailSkeleton />, <Skeleton className="h-4 w-24 rounded" />)

  if (isError || !cr || !data) {
    return shell(
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">No se encontró la change request</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Verificá que el link sea correcto o volvé a intentar.</p>
      </div>,
      <span className="font-medium text-foreground">—</span>,
    )
  }

  return shell(
    <>
      <CRHeader cr={cr} />
      <CRDecisionBanner cr={cr} events={data.events} />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Izquierda: contenido principal ─────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">
          <CRClientRequest cr={cr} items={data.items} />
          <CRProposalSection
            id={id}
            cr={cr}
            proposals={data.proposals}
            draftProposal={data.draftProposal ?? null}
            approvedProposal={data.approvedProposal}
          />
          <CRImpact cr={cr} />
          <CRAttachments id={id} attachments={data.attachments} />
          <CRComments id={id} comments={data.comments} />
          <CRTimeline events={data.events} />
        </div>

        {/* ── Derecha: acciones + vínculos ────────────────────────────────── */}
        <div className="w-full space-y-6 lg:w-80 lg:flex-shrink-0">
          <CRActions id={id} cr={cr} />
          <CRLinks dealId={cr.dealId} links={data.links} />
        </div>
      </div>
    </>,
    <span className="font-mono font-medium text-foreground">CR#{cr.number}</span>,
  )
}
