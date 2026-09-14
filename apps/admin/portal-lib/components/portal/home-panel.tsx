'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  usePortalPendingCounts,
  useClientProject,
  useClientNotifications,
  type PortalPending,
} from '@portal/lib/hooks'
import type { ClientProjectUpdate, ClientNotification } from '@portal/lib/types'
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
} from 'lucide-react'
import { CardListSkeleton, HomePanelSkeleton, ProjectStatusSkeleton } from '@portal/components/ui/skeletons'
import { PhasesRoadmap, type RoadmapPhase } from '@portal/components/project/phases-roadmap'
import { PhaseProgressBar } from '@portal/components/project/phase-progress-bar'
import { formatDate } from '@portal/lib/utils'
import { timeAgo } from '@portal/lib/time-ago'
import { portalBase } from '@portal/components/portal/portal-nav'

interface HomePanelProps {
  onNavigate: (tab: string) => void
}

// ─── Tu proyecto ────────────────────────────────────────────────────────────
// Fase actual (barra de progreso + próximo paso), actividad reciente,
// novedades curadas por el equipo y el plan completo (roadmap colapsado).
// Consume GET /api/client/project. Falla en silencio: un error acá nunca debe
// tirar abajo el resto del Home (inbox de pendientes).

const EMPTY_PENDING: PortalPending = {
  deliverables: [],
  forms: [],
  requests: [],
  invoices: [],
  counts: { deliverables: 0, forms: 0, requests: 0, invoices: 0, total: 0 },
  isLoading: false,
  isError: false,
}

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

// ─── Próximo paso ───────────────────────────────────────────────────────────
// Derivado 100% client-side a partir de lo que YA está esperando al cliente
// (`usePortalPendingCounts`, compartido con el sidebar) — sin fechas, porque
// el backend no las tiene (ni "entrega estimada" ni "trabajando en X" con
// bullets: eso lo inventaría esta pantalla). Prioridad fija: solicitudes de
// cambio > entregables > formularios > facturas vencidas > facturas
// pendientes. Si no hay nada pendiente, el mensaje cae al estado neutro
// ("el equipo está trabajando en...").

interface NextStep {
  text: string
  tab?: string
}

function computeNextStep(pending: PortalPending, inProduction: boolean, currentPhaseLabel: string | null): NextStep | null {
  const { requests, deliverables, forms, invoices } = pending

  if (requests.length > 0) {
    return {
      text:
        requests.length === 1
          ? 'Para seguir avanzando necesitamos tu decisión sobre una solicitud de cambio.'
          : `Para seguir avanzando necesitamos tu decisión sobre ${requests.length} solicitudes de cambio.`,
      tab: 'requests',
    }
  }

  if (deliverables.length > 0) {
    return {
      text:
        deliverables.length === 1
          ? 'Para seguir avanzando necesitamos tu revisión de un entregable.'
          : `Para seguir avanzando necesitamos tu revisión de ${deliverables.length} entregables.`,
      tab: 'deliverables',
    }
  }

  if (forms.length > 0) {
    return {
      text:
        forms.length === 1
          ? 'Para seguir avanzando necesitamos que completes un formulario.'
          : `Para seguir avanzando necesitamos que completes ${forms.length} formularios.`,
      tab: 'forms',
    }
  }

  const overdueInvoices = invoices.filter((inv) => inv.isOverdue)
  if (overdueInvoices.length > 0) {
    return {
      text:
        overdueInvoices.length === 1
          ? 'Para seguir avanzando necesitamos que regularices una factura vencida.'
          : `Para seguir avanzando necesitamos que regularices ${overdueInvoices.length} facturas vencidas.`,
      tab: 'invoices',
    }
  }

  if (invoices.length > 0) {
    return {
      text:
        invoices.length === 1
          ? 'Para seguir avanzando necesitamos que saldes una factura pendiente.'
          : `Para seguir avanzando necesitamos que saldes ${invoices.length} facturas pendientes.`,
      tab: 'invoices',
    }
  }

  if (inProduction && currentPhaseLabel) {
    return { text: `El equipo está trabajando en ${currentPhaseLabel}. Te avisamos cuando haya algo para revisar.` }
  }

  return null
}

// ─── Actividad reciente ─────────────────────────────────────────────────────
// Las 5 notificaciones más recientes del cliente. Reusa el catálogo de
// GET /api/client/notifications que ya alimenta la campana — no hay página de
// "ver toda la actividad" todavía, así que no hay link a ningún lado más allá
// de cada ítem. Nunca marca como leído: eso es una acción explícita de la
// campana, no algo que deba pasar por el solo hecho de abrir el Home.

function ActivityRow({ notification }: { notification: ClientNotification }) {
  const router = useRouter()
  const pathname = usePathname()
  const href = notification.actionUrl?.startsWith('/') ? notification.actionUrl : null

  const body = (
    <>
      <span className="block text-sm font-medium leading-snug text-foreground">{notification.title}</span>
      {notification.body && (
        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{notification.body}</span>
      )}
      <span className="mt-1 block text-[11px] text-muted-foreground/70">{timeAgo(notification.createdAt)}</span>
    </>
  )

  if (!href) {
    return <div className="rounded-xl border border-border bg-card px-4 py-3">{body}</div>
  }

  return (
    <button
      type="button"
      onClick={() => router.push(`${portalBase(pathname)}${href}`)}
      className="block w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  )
}

function RecentActivitySection() {
  const { data, isLoading, isError } = useClientNotifications()

  if (isLoading) {
    return <CardListSkeleton count={3} cardClassName="h-16" label="Cargando actividad reciente…" />
  }

  // Silencioso: sin actividad o con error, la sección directamente no existe
  // — no hay nada que un mensaje de error le sume acá.
  if (isError) return null

  const items = (data ?? []).slice(0, 5)
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="eyebrow">Actividad reciente</h3>
      <div className="space-y-2">
        {items.map((n) => (
          <ActivityRow key={n.id} notification={n} />
        ))}
      </div>
    </section>
  )
}

// ─── Tu proyecto ────────────────────────────────────────────────────────────

function ProjectSection({
  pending,
  onNavigate,
}: {
  pending: PortalPending
  onNavigate: (tab: string) => void
}) {
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
  const roadmapPhases: RoadmapPhase[] | null =
    project.phases?.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      isCurrent: p.isCurrent,
      isDone: p.isDone,
    })) ?? null

  const currentIdx = project.phases?.findIndex((p) => p.isCurrent) ?? -1
  const phaseNumber = currentIdx >= 0 ? currentIdx + 1 : null
  const totalPhases = project.phases?.length ?? 0

  const nextStep = computeNextStep(pending, project.inProduction, project.currentPhase?.label ?? null)
  const nothingPending = pending.counts.total === 0

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">Tu proyecto</p>
            <h2 className="font-editorial mt-1 text-2xl leading-tight text-foreground">{project.deal.name}</h2>
          </div>
        </div>

        {nothingPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
            Todo al día — no tenés ninguna acción pendiente.
          </p>
        )}

        {project.inProduction && project.currentPhase && roadmapPhases ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-2">
              <p className="eyebrow flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
                {phaseNumber ? `Fase ${phaseNumber} de ${totalPhases}` : 'Fase actual'}
              </p>
              <PhaseProgressBar phases={roadmapPhases} />
            </div>

            <div>
              <p className="font-editorial text-lg leading-tight text-foreground">{project.currentPhase.label}</p>
              {project.currentPhase.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {project.currentPhase.description}
                </p>
              )}
            </div>

            {nextStep && (
              <div className="border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
                {nextStep.text}
                {nextStep.tab && (
                  <>
                    {' '}
                    <Button
                      variant="link"
                      className="h-auto p-0 align-baseline text-sm"
                      onClick={() => onNavigate(nextStep.tab!)}
                    >
                      Revisar ahora
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
            Tu proyecto está en preparación — apenas arranque la fase de Diagnóstico lo vas a ver acá.
          </div>
        )}
      </div>

      <RecentActivitySection />

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

      {project.inProduction && roadmapPhases && (
        <div className="space-y-3">
          <h3 className="eyebrow">Plan del proyecto</h3>
          <PhasesRoadmap phases={roadmapPhases} collapseAll showStatusLabel />
        </div>
      )}
    </div>
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

// ─── Panel ────────────────────────────────────────────────────────────────────

export function HomePanel({ onNavigate }: HomePanelProps) {
  // Los criterios de "pendiente" viven en el hook, compartidos con los badges
  // del sidebar. Sin eso, el badge y la tarjeta podrían decir cosas distintas
  // sobre lo mismo en cuanto alguien tocara un filtro.
  const pending = usePortalPendingCounts()

  if (pending.isLoading) {
    return (
      <div className="space-y-8">
        <HomePanelSkeleton count={4} label="Cargando resumen de tu proyecto…" />
        <ProjectStatusSkeleton />
      </div>
    )
  }

  if (pending.isError) {
    return (
      <div className="space-y-8">
        <p className="py-8 text-sm text-destructive">
          No se pudo cargar el resumen. Intentá recargar la página.
        </p>
        <ProjectSection pending={EMPTY_PENDING} onNavigate={onNavigate} />
      </div>
    )
  }

  const pendingDeliverables = pending.deliverables
  const pendingForms = pending.forms
  const pendingCRs = pending.requests
  const alertInvoices = pending.invoices
  const overdueInvoiceCount = alertInvoices.filter((inv) => inv.isOverdue).length

  const hasAnything = pending.counts.total > 0

  // Lo accionable va PRIMERO y el estado del proyecto abajo: si el cliente
  // entra al portal es casi siempre porque algo lo espera. Cuando no hay nada
  // pendiente, esta grilla directamente no se muestra — el aviso de "todo al
  // día" pasa a ser una línea discreta dentro de "Tu proyecto" en vez de un
  // estado vacío grande, así la pantalla no se siente vacía cuando en
  // realidad hay un proyecto activo con contenido abajo (actividad,
  // novedades, plan).
  return (
    <div className="space-y-8">
      {hasAnything && (
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
                  overdueInvoiceCount > 0
                    ? overdueInvoiceCount === 1
                      ? 'Tenés una factura vencida con saldo pendiente.'
                      : `Tenés ${overdueInvoiceCount} facturas vencidas con saldo pendiente.`
                    : alertInvoices.length === 1
                      ? 'Tenés una factura pendiente de pago.'
                      : `Tenés ${alertInvoices.length} facturas pendientes de pago.`
                }
                tab="invoices"
                onNavigate={onNavigate}
                variant={overdueInvoiceCount > 0 ? 'signal' : 'default'}
              />
            )}
          </div>
        </div>
      )}

      <ProjectSection pending={pending} onNavigate={onNavigate} />
    </div>
  )
}
