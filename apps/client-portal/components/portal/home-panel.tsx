'use client'

import {
  useClientDeliverables,
  useClientIntakes,
  useClientChangeRequests,
  useClientInvoices,
} from '@/lib/hooks'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  GitPullRequest,
  Loader2,
  Receipt,
  Sparkles,
} from 'lucide-react'

interface HomePanelProps {
  onNavigate: (tab: string) => void
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
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
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
    return <AllClear />
  }

  return (
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
  )
}
