'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { DeliverablesPanel } from '@portal/components/portal/deliverables-panel'
import { FormsPanel } from '@portal/components/portal/forms-panel'
import { RequestsPanel } from '@portal/components/portal/requests-panel'
import { InvoicesPanel } from '@portal/components/portal/invoices-panel'
import { DocumentsPanel } from '@portal/components/portal/documents-panel'
import { ClientOnboardingWizard } from '@portal/components/onboarding/client-onboarding-wizard'
import { useClientOnboarding, usePortalPendingCounts, type PortalPending } from '@portal/lib/hooks'
import { PortalSidebar } from '@portal/components/portal/portal-sidebar'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { Skeleton } from '@portal/components/ui/skeleton'
import { House, FileText, ClipboardList, GitPullRequest, Receipt, FolderOpen } from 'lucide-react'

type TabId = 'home' | 'deliverables' | 'forms' | 'requests' | 'invoices' | 'documents'

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'deliverables', label: 'Entregables', Icon: FileText },
  { id: 'forms', label: 'Formularios', Icon: ClipboardList },
  { id: 'requests', label: 'Solicitudes', Icon: GitPullRequest },
  { id: 'invoices', label: 'Facturas', Icon: Receipt },
  { id: 'documents', label: 'Documentos', Icon: FolderOpen },
]

/**
 * De qué contador se alimenta el badge de cada sección. Inicio no lleva badge:
 * es justamente la pantalla que los resume todos.
 */
const BADGE_BY_TAB: Partial<Record<TabId, (p: PortalPending) => number>> = {
  deliverables: (p) => p.counts.deliverables,
  forms: (p) => p.counts.forms,
  requests: (p) => p.counts.requests,
  invoices: (p) => p.counts.invoices,
}

/**
 * Gating del onboarding post-venta: mientras `client_onboarding.status !==
 * 'completed'`, el wizard de 8 pasos reemplaza a los tabs normales del portal.
 *
 * `wizardActive` se decide UNA sola vez con los primeros datos que llegan
 * (`null` = todavía no se sabe → skeleton neutro) y después NO se vuelve a
 * recalcular a partir de refetches de la query — solo cambia cuando el propio
 * wizard llama a `onFinish` (botón "Ir a mi Portal" en la pantalla de cierre).
 * Sin este latch, la invalidación de la query que dispara `POST /complete`
 * haría desaparecer el wizard (y su pantalla de cierre celebratoria) en medio
 * de la animación, en cuanto el status pasa a 'completed' en background.
 */
function useOnboardingGate() {
  const { data, isLoading, isError } = useClientOnboarding()
  const [wizardActive, setWizardActive] = useState<boolean | null>(null)

  useEffect(() => {
    if (wizardActive === null && data) {
      setWizardActive(data.onboarding.status !== 'completed')
    }
  }, [data, wizardActive])

  return {
    loading: isLoading || (wizardActive === null && !isError),
    isError,
    wizardActive,
    dismiss: () => setWizardActive(false),
  }
}

export default function DashboardPage() {
  const { user } = useUser()
  // Email del usuario Clerk (reemplaza client.email del store JWT anterior).
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [collapsed, setCollapsed] = useState(false)
  const pending = usePortalPendingCounts()
  const gate = useOnboardingGate()

  // Mientras no sabemos si hay que mostrar el wizard (primera carga), un
  // skeleton neutro — evita el flash de tabs → wizard o wizard → tabs.
  if (gate.loading) {
    return (
      <SkeletonGroup label="Cargando tu portal…" className="space-y-4 py-10">
        <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
        <Skeleton className="mx-auto h-6 w-52" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </SkeletonGroup>
    )
  }

  // isError: si el estado del onboarding no pudo cargar, no bloqueamos el
  // portal — el cliente sigue viendo sus tabs normales (fail-open).
  if (gate.wizardActive) {
    return <ClientOnboardingWizard onFinish={gate.dismiss} />
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="eyebrow">Panel del cliente</p>
        <h1 className="font-editorial mt-1.5 text-3xl leading-tight tracking-tight text-foreground">
          Bienvenido{email ? `, ${email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Revisá el estado de tus proyectos y tomá acción donde sea necesario.
        </p>
      </div>

      {/*
        Navegación lateral con badges de pendientes por sección. Se abandonó
        Radix Tabs: `TabsContent` desmonta el panel inactivo, así que volver a
        una sección perdía su estado (scroll, filtros, formularios a medio
        llenar). Con render condicional sobre `activeTab` el comportamiento es
        el mismo que tenía —un panel a la vez— pero el control queda acá y el
        sidebar puede llevar su propio estado de colapsado.
      */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <PortalSidebar
          items={TABS.map(({ id, label, Icon }) => ({
            id,
            label,
            Icon,
            badge: BADGE_BY_TAB[id]?.(pending) ?? 0,
          }))}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />

        {/*
          `min-w-0`: un hijo de flex arranca con min-width:auto, así que una
          tabla ancha o un nombre de archivo largo empujarían el ancho y
          desbordarían el layout en vez de scrollear dentro de su panel.
        */}
        <div className="min-w-0 flex-1">
          {activeTab === 'home' && <HomePanel onNavigate={(tab) => setActiveTab(tab as TabId)} />}
          {activeTab === 'deliverables' && <DeliverablesPanel />}
          {activeTab === 'forms' && <FormsPanel />}
          {activeTab === 'requests' && <RequestsPanel />}
          {activeTab === 'invoices' && <InvoicesPanel />}
          {activeTab === 'documents' && <DocumentsPanel />}
        </div>
      </div>
    </div>
  )
}
