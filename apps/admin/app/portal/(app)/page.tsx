'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@portal/components/ui/tabs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { DeliverablesPanel } from '@portal/components/portal/deliverables-panel'
import { FormsPanel } from '@portal/components/portal/forms-panel'
import { RequestsPanel } from '@portal/components/portal/requests-panel'
import { InvoicesPanel } from '@portal/components/portal/invoices-panel'
import { DocumentsPanel } from '@portal/components/portal/documents-panel'
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

export default function DashboardPage() {
  const { user } = useUser()
  // Email del usuario Clerk (reemplaza client.email del store JWT anterior).
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const [activeTab, setActiveTab] = useState<TabId>('home')

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="eyebrow">Panel del cliente</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Bienvenido{email ? `, ${email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
