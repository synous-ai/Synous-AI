'use client'

import {
  useClientDeliverables,
  useClientIntakes,
  useClientChangeRequests,
  useClientInvoices,
  useClientProject,
} from '@portal/lib/hooks'
import type { ClientProjectUpdate } from '@portal/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@portal/components/ui/card'
import { Badge } from '@portal/components/ui/badge'
import { Button } from '@portal/components/ui/button'
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  GitPullRequest,
  Megaphone,
  Receipt,
  Sparkles,
} from 'lucide-react'
import { HomePanelSkeleton, ProjectStatusSkeleton } from '@portal/components/ui/skeletons'
import { PhasesRoadmap } from '@portal/components/project/phases-roadmap'
import { formatDate } from '@portal/lib/utils'

interface HomePanelProps {
  onNavigate: (tab: string) => void
}

// ─── Tu proyecto ────────────────────────────────────────────────────────────
// Fase actual + roadmap de las 9 fases (solo si `inProduction`) y novedades
// curadas por el equipo. Consume GET /api/client/project. Falla en silencio:
// un error acá nunca debe tirar abajo el resto del Home (inbox de pendientes).

function UpdateRow({ update }: { update: ClientProjectUpdate }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm leading-relaxed text-foreground">{update.body}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{formatDate(update.createdAt)}</span>
        {update.phaseLabel && (
          <Badge variant="muted" className="text-[10px]">
            {update.phaseLabel}
          </Badge>
        )}
      </div>
    </div>
  )
}

function ProjectSection() {
  const query = useClientProject()

  if (query.isLoading) {
    return <ProjectStatusSkeleton />
  }

  // Silencioso: si falla, no rompemos el resto del Home — simplemente no
  // mostramos esta sección.
  if (query.isError || !query.data) {
    return null
  }

  const project = query.data
  const roadmapPhases = project.phases?.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    isCurrent: p.isCurrent,
    isDone: p.isDone,
  }))

  return (
    <section className="space-y-4">
      <div>
        <p className="eyebrow">Tu proyecto</p>
        <h2 className="font-editorial mt-1 text-2xl leading-tight text-foreground">{project.deal.name}</h2>
      </div>

      {project.inProduction && project.currentPhase ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="eyebrow flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
              Fase actual: {project.currentPhase.label}
            </p>
            {project.currentPhase.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {project.currentPhase.description}
              </p>
            )}
          </div>
          {roadmapPhases && <PhasesRoadmap phases={roadmapPhases} />}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          Tu proyecto está en preparación — apenas arranque la fase de Diagnóstico lo vas a ver acá.
        </div>
      )}

      <div>
        <h3 className="eyebrow mb-3 flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
          Novedades
        </h3>
        {project.updates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground/70">
            Todavía no hay novedades — el equipo va publicando avances acá.
          </p>
        ) : (
          <div className="space-y-2">
            {project.updates.map((u) => (
              <UpdateRow key={u.id} update={u} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  title,
  count,
  description,
  tab,
  onNavigate,
  variant = 'default',
}: {
  icon: React.ElementType
  title: string
  count: number
  description: string
  tab: string
  onNavigate: (tab: string) => void
  variant?: 'signal' | 'default'
}) {
  return (
    <Card className={variant === 'signal' ? 'border-signal/40 bg-signal/5' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <Badge variant={variant === 'signal' ? 'signal' : 'default'}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-sm text-muted-foreground">{description}</p>
        <Button size="sm" variant="outline" onClick={() => onNavigate(tab)}>
          Ver {title.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── All Clear State ──────────────────────────────────────────────────────────

function AllClear() {
  return (
    <div className="flex flex-col items-center gap-4 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Sparkles className="h-7 w-7 text-accent-foreground" />
      </div>
      <div>
        <p className="text-lg font-semibold">Todo al día</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No hay nada pendiente de tu parte en este momento. ¡Excelente!
        </p>
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function HomePanel({ onNavigate }: HomePanelProps) {
  const deliverablesQuery = useClientDeliverables()
  const intakesQuery = useClientIntakes()
  const crQuery = useClientChangeRequests()
  const invoicesQuery = useClientInvoices()

  const isLoading =
    deliverablesQuery.isLoading ||
    intakesQuery.isLoading ||
    crQuery.isLoading ||
    invoicesQuery.isLoading

  if (isLoading) {
    return (
      <div className="space-y-8">
        <ProjectSection />
        <HomePanelSkeleton count={4} label="Cargando resumen de tu proyecto…" />
      </div>
    )
  }

  const isError =
    deliverablesQuery.isError ||
    intakesQuery.isError ||
    crQuery.isError ||
    invoicesQuery.isError

  if (isError) {
    return (
      <div className="space-y-8">
        <ProjectSection />
        <p className="py-8 text-sm text-destructive">
          No se pudo cargar el resumen. Intentá recargar la página.
        </p>
      </div>
    )
  }

  const deliverables = deliverablesQuery.data ?? []
  const intakes = intakesQuery.data ?? []
  const changeRequests = crQuery.data ?? []
  const invoices = invoicesQuery.data ?? []

  // Count items that need client action
  const pendingDeliverables = deliverables.filter(
    (d) => d.status === 'pending_review' || d.status === 'changes_requested',
  )
  const pendingForms = intakes.filter(
    (i) => i.status === 'pending' || i.status === 'in_progress',
  )
  const pendingCRs = changeRequests.filter((cr) =>
    (['sent', 'negotiating'] as string[]).includes(cr.status),
  )
  const alertInvoices = invoices.filter(
    (inv) => inv.status === 'sent' || inv.status === 'overdue',
  )

  const hasAnything =
    pendingDeliverables.length > 0 ||
    pendingForms.length > 0 ||
    pendingCRs.length > 0 ||
    alertInvoices.length > 0

  if (!hasAnything) {
    return (
      <div className="space-y-8">
        <ProjectSection />
        <AllClear />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <ProjectSection />

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Estas son las acciones que están esperando tu atención.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {pendingForms.length > 0 && (
            <SummaryCard
              icon={ClipboardList}
              title="Formularios"
              count={pendingForms.length}
              description={
                pendingForms.length === 1
                  ? 'Tenés un formulario pendiente de completar.'
                  : `Tenés ${pendingForms.length} formularios pendientes de completar.`
              }
              tab="forms"
              onNavigate={onNavigate}
              variant="signal"
            />
          )}

          {pendingDeliverables.length > 0 && (
            <SummaryCard
              icon={FileText}
              title="Entregables"
              count={pendingDeliverables.length}
              description={
                pendingDeliverables.length === 1
                  ? 'Hay un entregable esperando tu revisión.'
                  : `Hay ${pendingDeliverables.length} entregables esperando tu revisión.`
              }
              tab="deliverables"
              onNavigate={onNavigate}
              variant="signal"
            />
          )}

          {pendingCRs.length > 0 && (
            <SummaryCard
              icon={GitPullRequest}
              title="Solicitudes"
              count={pendingCRs.length}
              description={
                pendingCRs.length === 1
                  ? 'Hay una solicitud de cambio que requiere tu decisión.'
                  : `Hay ${pendingCRs.length} solicitudes de cambio que requieren tu decisión.`
              }
              tab="requests"
              onNavigate={onNavigate}
              variant="signal"
            />
          )}

          {alertInvoices.length > 0 && (
            <SummaryCard
              icon={Receipt}
              title="Facturas"
              count={alertInvoices.length}
              description={
                alertInvoices.some((inv) => inv.status === 'overdue')
                  ? 'Tenés facturas vencidas con saldo pendiente.'
                  : 'Tenés facturas emitidas con saldo pendiente.'
              }
              tab="invoices"
              onNavigate={onNavigate}
            />
          )}
        </div>

        {/* All clear line if some sections are clean */}
        {pendingDeliverables.length === 0 &&
          pendingForms.length === 0 &&
          pendingCRs.length === 0 &&
          alertInvoices.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
              No hay nada más pendiente. ¡Todo al día!
            </div>
          )}
      </div>
    </div>
  )
}
