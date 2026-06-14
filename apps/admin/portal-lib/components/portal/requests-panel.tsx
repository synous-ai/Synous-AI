'use client'

import { useState } from 'react'
import { useClientChangeRequests, useApproveCR, useRejectCR } from '@portal/lib/hooks'
import type { ChangeRequest, ChangeRequestStatus } from '@portal/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@portal/components/ui/card'
import { Button } from '@portal/components/ui/button'
import { Badge } from '@portal/components/ui/badge'
import { Textarea } from '@portal/components/ui/textarea'
import { CheckCircle2, GitPullRequest, Loader2, MessageSquare } from 'lucide-react'
import { CardListSkeleton } from '@portal/components/ui/skeletons'
import { formatCurrency } from '@portal/lib/utils'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'

// ─── Status helpers ───────────────────────────────────────────────────────────

const CR_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  negotiating: 'En negociación',
  approved_verbally: 'Aprobada verbalmente',
  disputed: 'En disputa',
  completed: 'Completada',
}

const CR_STATUS_VARIANT: Record<
  ChangeRequestStatus,
  'default' | 'signal' | 'accent' | 'destructive' | 'muted' | 'outline'
> = {
  sent: 'signal',
  negotiating: 'signal',
  approved: 'accent',
  approved_verbally: 'accent',
  completed: 'accent',
  rejected: 'destructive',
  disputed: 'muted',
}

const CR_ACTIONABLE: ChangeRequestStatus[] = ['sent', 'negotiating']

// ─── Change Request Card ──────────────────────────────────────────────────────

export function ChangeRequestCard({ cr }: { cr: ChangeRequest }) {
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const approveCR = useApproveCR()
  const rejectCR = useRejectCR()

  const isActionable = (CR_ACTIONABLE as string[]).includes(cr.status)

  async function handleApprove() {
    await approveCR.mutateAsync({ id: cr.id })
  }

  async function handleReject() {
    await rejectCR.mutateAsync({ id: cr.id, comment: rejectComment.trim() || undefined })
    setRejectComment('')
    setShowRejectForm(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              CR #{cr.number} · {cr.title}
            </CardTitle>
            {cr.description && (
              <p className="text-sm text-muted-foreground">{cr.description}</p>
            )}
          </div>
          <Badge variant={CR_STATUS_VARIANT[cr.status]}>
            {CR_STATUS_LABEL[cr.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {cr.totalAmount && (
            <span className="font-semibold text-foreground">
              {formatCurrency(cr.totalAmount, 'USD')}
            </span>
          )}
          {cr.timelineImpactDays > 0 && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
              +{cr.timelineImpactDays} día{cr.timelineImpactDays !== 1 ? 's' : ''} de plazo
            </span>
          )}
          {cr.newDeliveryDate && (
            <span className="text-xs">
              Nueva entrega:{' '}
              {new Intl.DateTimeFormat('es', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }).format(new Date(cr.newDeliveryDate))}
            </span>
          )}
        </div>

        {isActionable && (
          <div className="space-y-3">
            {showRejectForm ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Comentario opcional sobre el rechazo…"
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleReject}
                    disabled={rejectCR.isPending}
                  >
                    {rejectCR.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Confirmar rechazo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowRejectForm(false)
                      setRejectComment('')
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="signal"
                  onClick={handleApprove}
                  disabled={approveCR.isPending}
                >
                  {approveCR.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRejectForm(true)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Rechazar
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function RequestsPanel() {
  const query = useClientChangeRequests()
  const changeRequests = query.data ?? []

  if (query.isLoading) {
    return <CardListSkeleton count={3} label="Cargando solicitudes de cambio…" />
  }

  if (query.isError) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se pudieron cargar las solicitudes de cambio.
      </p>
    )
  }

  if (changeRequests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={GitPullRequest} />
        <div>
          <p className="font-medium text-muted-foreground">Sin Solicitudes de Cambio</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            Cuando el equipo envíe una solicitud de cambio, aparecerá acá para que la revisés.
          </p>
        </div>
      </div>
    )
  }

  const pending = changeRequests.filter((cr) => (CR_ACTIONABLE as string[]).includes(cr.status))
  const resolved = changeRequests.filter((cr) => !(CR_ACTIONABLE as string[]).includes(cr.status))

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Requieren tu decisión
          </h3>
          <div className="space-y-3">
            {pending.map((cr) => (
              <ChangeRequestCard key={cr.id} cr={cr} />
            ))}
          </div>
        </section>
      )}
      {resolved.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Resueltas
          </h3>
          <div className="space-y-3">
            {resolved.map((cr) => (
              <ChangeRequestCard key={cr.id} cr={cr} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
