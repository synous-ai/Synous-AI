'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@portal/components/ui/tabs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { DeliverablesPanel } from '@portal/components/portal/deliverables-panel'
import { FormsPanel } from '@portal/components/portal/forms-panel'
import { RequestsPanel } from '@portal/components/portal/requests-panel'
import { InvoicesPanel } from '@portal/components/portal/invoices-panel'
import { DocumentsPanel } from '@portal/components/portal/documents-panel'
import { ClientOnboardingWizard } from '@portal/components/onboarding/client-onboarding-wizard'
import { useClientOnboarding } from '@portal/lib/hooks'
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

      {/* Tab navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabId)}
        className="w-full"
      >
        <TabsList className="flex w-full overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="flex-1 gap-1.5 text-xs sm:text-sm"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.slice(0, 4)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="home" className="mt-6">
          <HomePanel onNavigate={(tab) => setActiveTab(tab as TabId)} />
        </TabsContent>

        <TabsContent value="deliverables" className="mt-6">
          <DeliverablesPanel />
        </TabsContent>

        <TabsContent value="forms" className="mt-6">
          <FormsPanel />
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          <RequestsPanel />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesPanel />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
