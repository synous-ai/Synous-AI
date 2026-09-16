'use client'

import { useUser } from '@clerk/nextjs'
import { SectionHeader } from '@portal/components/portal/section-header'
import { DashboardPanel } from '@portal/components/portal/dashboard/dashboard-panel'

export default function DashboardPage() {
  const { user } = useUser()

  // Nombre real de Clerk primero (`firstName`); el email es el fallback de
  // siempre, no la fuente principal — "Bienvenido, jeremias.ingla" se leía
  // peor que "Bienvenido, Jeremias" cuando Clerk sí tiene el nombre cargado.
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const name = user?.firstName || (email ? email.split('@')[0] : '')

  return (
    <div className="space-y-8">
      {/*
        La descripción es FIJA y no cambia según si hay pendientes: antes se
        recalculaba acá arriba y terminaba diciendo lo mismo que la sección
        "Requiere tu atención" dos pantallas más abajo. El encabezado presenta
        la pantalla; el estado lo cuenta cada sección con datos reales.
      */}
      <SectionHeader
        eyebrow="Panel del cliente"
        title={`Bienvenido${name ? `, ${name}` : ''}`}
        description="Seguí el estado de tu proyecto y gestioná lo que necesita tu atención."
      />
      <DashboardPanel />
    </div>
  )
}
