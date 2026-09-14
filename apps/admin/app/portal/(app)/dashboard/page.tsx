'use client'

import { useUser } from '@clerk/nextjs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { SectionHeader } from '@portal/components/portal/section-header'
import { usePortalNav, type PortalTabId } from '@portal/components/portal/portal-nav'

export default function DashboardPage() {
  const { user } = useUser()
  const { goTo } = usePortalNav()
  // Email del usuario Clerk (reemplaza client.email del store JWT anterior).
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Panel del cliente"
        title={`Bienvenido${email ? `, ${email.split('@')[0]}` : ''}`}
        description="Revisá el estado de tus proyectos y tomá acción donde sea necesario."
      />
      {/* Las tarjetas de pendientes llevan a cada sección: ahora navegan de
          verdad en vez de cambiar un estado local. */}
      <HomePanel onNavigate={(tab) => goTo(tab as PortalTabId)} />
    </div>
  )
}
