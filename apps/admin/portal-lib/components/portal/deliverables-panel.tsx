'use client'

import { useState } from 'react'
import { useClientDeliverables, useApproveDeliverable, useRequestChanges } from '@portal/lib/hooks'
import type { Deliverable, DeliverableStatus } from '@portal/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@portal/components/ui/card'
import { Button } from '@portal/components/ui/button'
import { Badge } from '@portal/components/ui/badge'
import { Textarea } from '@portal/components/ui/textarea'
import {
  ExternalLink,
  CheckCircle2,
  MessageSquare,
  Loader2,
  FileText,
} from 'lucide-react'
import { CardListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DeliverableStatus, string> = {
  pending_review: 'Pendiente de revisión',
  approved: 'Aprobado',
  changes_requested: 'Cambios solicitados',
}

const STATUS_VARIANT: Record<DeliverableStatus, 'signal' | 'accent' | 'muted'> = {
  pending_review: 'signal',
  approved: 'accent',
  changes_requested: 'muted',
}

// ─── Deliverable Card ─────────────────────────────────────────────────────────

export function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const approve = useApproveDeliverable()
  const requestChanges = useRequestChanges()

  const isActionable =
    deliverable.status === 'pending_review' || deliverable.status === 'changes_requested'

  // Los catch vacíos NO se tragan el error: react-query lo guarda en
  // `approve.error` / `requestChanges.error` y se renderiza abajo. El try/catch
  // sólo evita la unhandled promise rejection de `mutateAsync`, y acá garantiza
  // que el feedback escrito no se pierda si la request falló.
  async function handleApprove() {
    try {
      await approve.mutateAsync(deliverable.id)
    } catch {
      /* el error se muestra vía approve.error */
    }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) return
    try {
      await requestChanges.mutateAsync({ id: deliverable.id, feedback: feedback.trim() })
      setFeedback('')
      setShowFeedbackForm(false)
    } catch {
      /* el error se muestra vía requestChanges.error */
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{deliverable.title}</CardTitle>
            {deliverable.description && (
              <p className="text-sm text-muted-foreground">{deliverable.description}</p>
            )}
          </div>
          <Badge variant={STATUS_VARIANT[deliverable.status]}>
            {STATUS_LABEL[deliverable.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono">{deliverable.type}</span>
          <span>v{deliverable.version}</span>
          {deliverable.url && (
            <a
              href={deliverable.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              Ver entregable
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {deliverable.feedback && deliverable.status === 'changes_requested' && (
          <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Último feedback
            </p>
            <p>{deliverable.feedback}</p>
          </div>
        )}

        {isActionable && (
          <div className="space-y-3">
            {showFeedbackForm ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Describí los cambios que necesitás…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleRequestChanges}
                    disabled={!feedback.trim() || requestChanges.isPending}
                  >
                    {requestChanges.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Enviar feedback
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowFeedbackForm(false)
                      setFeedback('')
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
                  disabled={approve.isPending}
                >
                  {approve.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowFeedbackForm(true)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Pedir cambios
                </Button>
              </div>
            )}

            {/* Sin esto, un fallo de aprobar/pedir cambios era INVISIBLE: el
                spinner paraba y el cliente creía que su acción se registró. */}
            {(approve.isError || requestChanges.isError) && (
              <p role="alert" className="text-xs text-destructive">
                No pudimos registrar tu respuesta. Probá de nuevo en unos
                segundos; si sigue fallando, escribinos.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DeliverablesPanel() {
  const query = useClientDeliverables()
  const deliverables = query.data ?? []

  if (query.isLoading) {
    return <CardListSkeleton count={3} label="Cargando entregables…" />
  }

  if (query.isError) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se pudieron cargar los entregables.
      </p>
    )
  }

  if (deliverables.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={FileText} />
        <div>
          <p className="font-medium text-muted-foreground">Sin Entregables Aún</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            Cuando el equipo suba materiales para revisar, aparecerán acá.
          </p>
        </div>
      </div>
    )
  }

  const actionable = deliverables.filter(
    (d) => d.status === 'pending_review' || d.status === 'changes_requested',
  )
  const approved = deliverables.filter((d) => d.status === 'approved')

  return (
    <div className="space-y-6">
      {actionable.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">
            Para revisar
          </h3>
          <div className="space-y-3">
            {actionable.map((d) => (
              <DeliverableCard key={d.id} deliverable={d} />
            ))}
          </div>
        </section>
      )}
      {approved.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">
            Aprobados
          </h3>
          <div className="space-y-3">
            {approved.map((d) => (
              <DeliverableCard key={d.id} deliverable={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
