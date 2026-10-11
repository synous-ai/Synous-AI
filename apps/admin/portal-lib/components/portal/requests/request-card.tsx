'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { formatCurrency, formatDate } from '@synous/shared'
import type { ChangeRequest } from '@portal/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@portal/components/ui/card'
import { Badge } from '@portal/components/ui/badge'
import { crBadgeVariant, crClientLabel, requestedByDisplayName } from '@portal/components/portal/requests/cr-status'
import { RequestActions } from '@portal/components/portal/requests/cr-decision-dialogs'
import { portalBase } from '@portal/components/portal/portal-nav'

/**
 * Un dato de meta-fila (costo, plazo, fecha, solicitante) — solo se agrega al
 * arreglo cuando el valor existe. Sin esto la card terminaba mostrando "—" en
 * campos de propuesta antes de que existiera ninguna propuesta.
 */
function metaParts(cr: ChangeRequest): string[] {
  const parts: string[] = []
  if (cr.totalAmount) parts.push(formatCurrency(cr.totalAmount, cr.currency))
  if (cr.timelineImpactDays > 0) {
    parts.push(`+${cr.timelineImpactDays} día${cr.timelineImpactDays !== 1 ? 's' : ''} de plazo`)
  }
  if (cr.newDeliveryDate) parts.push(`Nueva entrega: ${formatDate(cr.newDeliveryDate)}`)
  return parts
}

export function RequestCard({ cr }: { cr: ChangeRequest }) {
  const pathname = usePathname()
  const detailHref = `${portalBase(pathname)}/requests/${cr.id}`
  const meta = metaParts(cr)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">
              CR #{cr.number} · {cr.title}
            </CardTitle>
            <p className="line-clamp-2 text-sm text-muted-foreground">{cr.description}</p>
          </div>
          <Badge variant={crBadgeVariant(cr.status)} className="shrink-0 whitespace-nowrap">
            {crClientLabel(cr.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <dt className="sr-only">Solicitado por</dt>
            <dd>{requestedByDisplayName(cr)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="sr-only">Fecha</dt>
            <dd>{formatDate(cr.createdAt)}</dd>
          </div>
          {meta.map((part) => (
            <span key={part} className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground/80">
              {part}
            </span>
          ))}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <RequestActions cr={cr} />
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ver detalle
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
