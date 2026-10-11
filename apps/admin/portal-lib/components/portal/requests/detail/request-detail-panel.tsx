'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CHANGE_REQUEST_PRIORITY_LABEL, formatDate } from '@synous/shared'
import { useClientChangeRequest } from '@portal/lib/hooks'
import { Badge } from '@portal/components/ui/badge'
import { CardListSkeleton } from '@portal/components/ui/skeletons'
import { Button } from '@portal/components/ui/button'
import { crBadgeVariant, crClientLabel, requestedByDisplayName } from '@portal/components/portal/requests/cr-status'
import { RequestActions } from '@portal/components/portal/requests/cr-decision-dialogs'
import { DetailProposal } from '@portal/components/portal/requests/detail/detail-proposal'
import { DetailFiles } from '@portal/components/portal/requests/detail/detail-files'
import { DetailActivity } from '@portal/components/portal/requests/detail/detail-activity'
import { DetailComments } from '@portal/components/portal/requests/detail/detail-comments'
import { portalBase } from '@portal/components/portal/portal-nav'

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Volver a Solicitudes
    </Link>
  )
}

export function RequestDetailPanel({ id }: { id: string }) {
  const pathname = usePathname()
  const backHref = `${portalBase(pathname)}/requests`
  const detail = useClientChangeRequest(id)

  if (detail.isLoading) {
    return (
      <div className="space-y-6">
        <BackLink href={backHref} />
        <CardListSkeleton count={4} label="Cargando solicitud…" />
      </div>
    )
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-6">
        <BackLink href={backHref} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-destructive">No pudimos cargar esta solicitud.</p>
          <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  const { changeRequest: cr, currentProposal, approvedProposal, comments, events, attachments } = detail.data

  return (
    <div className="space-y-8">
      <BackLink href={backHref} />

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Tu proyecto</p>
            <h1 className="font-editorial mt-1.5 text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
              CR #{cr.number} — {cr.title}
            </h1>
          </div>
          <Badge variant={crBadgeVariant(cr.status)} className="shrink-0 whitespace-nowrap">
            {crClientLabel(cr.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Solicitado por {requestedByDisplayName(cr)} · {formatDate(cr.createdAt)}
        </p>
        <RequestActions cr={cr} size="default" />
      </header>

      <section aria-labelledby="cr-request-title" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="cr-request-title" className="eyebrow">
          Solicitud
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{cr.description}</p>
        {cr.context && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motivo / contexto</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{cr.context}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Prioridad: {CHANGE_REQUEST_PRIORITY_LABEL[cr.priority]}</p>
      </section>

      <DetailProposal currentProposal={currentProposal} approvedProposal={approvedProposal} currency={cr.currency} />
      <DetailFiles attachments={attachments} />
      <DetailActivity events={events} />
      <DetailComments id={cr.id} comments={comments} />
    </div>
  )
}
