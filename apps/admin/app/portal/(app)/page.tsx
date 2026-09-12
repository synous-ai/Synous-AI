'use client'

import { useUser } from '@clerk/nextjs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { DeliverablesPanel } from '@portal/components/portal/deliverables-panel'
import { FormsPanel } from '@portal/components/portal/forms-panel'
import { RequestsPanel } from '@portal/components/portal/requests-panel'
import { InvoicesPanel } from '@portal/components/portal/invoices-panel'
import { DocumentsPanel } from '@portal/components/portal/documents-panel'
import { ClientOnboardingWizard } from '@portal/components/onboarding/client-onboarding-wizard'
import { usePortalNav, type PortalTabId } from '@portal/components/portal/portal-nav'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { Skeleton } from '@portal/components/ui/skeleton'

/**
 * Contenido del portal. La navegación (rail izquierdo, debajo del header) vive
 * en el layout; acá solo se decide QUÉ panel se pinta según `activeTab`.
 *
 * Se abandonó Radix Tabs: `TabsContent` desmonta el panel inactivo, así que
 * volver a una sección perdía su estado (scroll, filtros, formularios a medio
 * llenar). Con render condicional sobre `activeTab` el comportamiento es el
 * mismo que tenía —un panel a la vez— pero el control queda en el contexto
 * compartido del shell.
 */
export default function DashboardPage() {
  const { user } = useUser()
  // Email del usuario Clerk (reemplaza client.email del store JWT anterior).
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const { activeTab, setActiveTab, onboarding } = usePortalNav()

  // Mientras no sabemos si hay que mostrar el wizard (primera carga), un
  // skeleton neutro — evita el flash de paneles → wizard o wizard → paneles.
  if (onboarding.loading) {
    return (
      <SkeletonGroup label="Cargando tu portal…" className="space-y-4 py-10">
        <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
        <Skeleton className="mx-auto h-6 w-52" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </SkeletonGroup>
    )
  }

  // isError: si el estado del onboarding no pudo cargar, no bloqueamos el
  // portal — el cliente sigue viendo sus secciones normales (fail-open).
  if (onboarding.wizardActive) {
    return <ClientOnboardingWizard onFinish={onboarding.dismiss} />
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

      {activeTab === 'home' && (
        <HomePanel onNavigate={(tab) => setActiveTab(tab as PortalTabId)} />
      )}
      {activeTab === 'deliverables' && <DeliverablesPanel />}
      {activeTab === 'forms' && <FormsPanel />}
      {activeTab === 'requests' && <RequestsPanel />}
      {activeTab === 'invoices' && <InvoicesPanel />}
      {activeTab === 'documents' && <DocumentsPanel />}
    </div>
  )
}
