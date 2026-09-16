'use client'

import { usePathname } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { usePortalPendingCounts } from '@portal/lib/hooks'
import { buildClientActions, groupOverflow, DASHBOARD_ACTION_LIMIT } from '@portal/lib/client-actions'
import { portalBase } from '@portal/components/portal/portal-nav'
import { ClientActionCard } from '@portal/components/portal/dashboard/client-action-card'
import { DashboardSection, SectionError, SectionLink } from '@portal/components/portal/dashboard/dashboard-section'
import { ActionCardsSkeleton } from '@portal/components/portal/dashboard/dashboard-skeletons'

/**
 * "Requiere tu atención" — las acciones concretas que esperan al cliente.
 *
 * Qué cuenta como acción, con qué urgencia y a dónde lleva vive en
 * `lib/client-actions.ts`; qué está pendiente por sección, en
 * `usePortalPendingCounts` (el mismo hook que alimenta los badges del
 * sidebar). Acá solo queda componer: ordenar ya viene hecho, recortar a las
 * más relevantes y ofrecer salida al resto.
 *
 * La sección NUNCA se oculta: "no tenés nada pendiente" es información que el
 * cliente vino a buscar, y una sección que desaparece se lee como algo que no
 * cargó.
 */
export function AttentionSection() {
  const pathname = usePathname()
  const pending = usePortalPendingCounts()

  if (pending.isLoading) {
    return (
      <DashboardSection id="dashboard-attention" title="Requiere tu atención">
        <ActionCardsSkeleton />
      </DashboardSection>
    )
  }

  if (pending.isError) {
    return (
      <DashboardSection id="dashboard-attention" title="Requiere tu atención">
        <SectionError
          message="No pudimos cargar lo que está esperando tu atención."
          onRetry={() => pending.refetch()}
        />
      </DashboardSection>
    )
  }

  const actions = buildClientActions({
    invoices: pending.invoices,
    requests: pending.requests,
    // Solo `pending_review`: un entregable con cambios pedidos ya recibió su
    // feedback y la pelota es del equipo. Ver `deliverablesAwaitingReview`.
    deliverables: pending.deliverablesAwaitingReview,
    forms: pending.forms,
  })

  const shown = actions.slice(0, DASHBOARD_ACTION_LIMIT)
  const overflow = groupOverflow(actions.slice(DASHBOARD_ACTION_LIMIT))

  return (
    <DashboardSection
      id="dashboard-attention"
      title="Requiere tu atención"
      aside={
        actions.length > 0 ? (
          <span>
            {actions.length} {actions.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        ) : null
      }
    >
      {actions.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4">
          <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Todo al día</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              No tenés acciones pendientes. Te avisamos cuando necesitemos algo de tu parte.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((action) => (
              <ClientActionCard key={action.id} action={action} />
            ))}
          </div>

          {/*
            El Inicio resume y prioriza; gestionar TODO sigue siendo trabajo de
            cada sección. Por eso lo que sobra no va a una pantalla nueva de
            "todas las acciones" —que duplicaría cuatro listados que ya
            existen— sino que se dice exactamente dónde quedó, con el número
            real de cada sección.
          */}
          {overflow.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
              <span>
                {overflow.reduce((n, g) => n + g.count, 0) === 1
                  ? 'Queda 1 acción más:'
                  : `Quedan ${overflow.reduce((n, g) => n + g.count, 0)} acciones más:`}
              </span>
              {overflow.map((group) => (
                <SectionLink key={group.kind} href={`${portalBase(pathname)}${group.href}`}>
                  {group.count} en {group.label}
                </SectionLink>
              ))}
            </div>
          )}
        </>
      )}
    </DashboardSection>
  )
}
