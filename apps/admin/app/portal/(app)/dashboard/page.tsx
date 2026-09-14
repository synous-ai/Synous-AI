'use client'

import { useUser } from '@clerk/nextjs'
import { HomePanel } from '@portal/components/portal/home-panel'
import { SectionHeader } from '@portal/components/portal/section-header'
import { usePortalNav, type PortalTabId } from '@portal/components/portal/portal-nav'
import { useClientProject } from '@portal/lib/hooks'
import { ApiError } from '@portal/lib/api'

export default function DashboardPage() {
  const { user } = useUser()
  const { goTo } = usePortalNav()
  // Mismo queryKey que `ProjectSection` (['client','project']) — TanStack
  // Query dedupe la request, así que pedirlo acá para el copy del header no
  // suma un round-trip extra.
  const projectQuery = useClientProject()

  // Nombre real de Clerk primero (`firstName`); el email es el fallback de
  // siempre, no la fuente principal — "Bienvenido, jeremias.ingla" se leía
  // peor que "Bienvenido, Jeremias" cuando Clerk sí tiene el nombre cargado.
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const name = user?.firstName || (email ? email.split('@')[0] : '')

  // 404 de GET /api/client/project es la señal real de "sin proyecto activo"
  // (`resolveActiveClientDeal` tira Errors.notFound). Cualquier OTRO error
  // (500, red caída) NO significa "sin proyecto" — mostrar ese copy ahí sería
  // mentirle al cliente; en ese caso se deja la descripción normal y
  // `ProjectSection` ya maneja su propio error en silencio (no rompe el Home).
  const isNoProjectError = projectQuery.error instanceof ApiError && projectQuery.error.status === 404
  const description = isNoProjectError
    ? 'Cuando tengamos un proyecto activo para vos, vas a ver acá su estado y lo que necesite tu atención.'
    : 'Este es el estado de tu proyecto y las acciones que requieren tu atención.'

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Panel del cliente"
        title={`Bienvenido${name ? `, ${name}` : ''}`}
        description={description}
      />
      {/* Las tarjetas de pendientes llevan a cada sección: ahora navegan de
          verdad en vez de cambiar un estado local. */}
      <HomePanel onNavigate={(tab) => goTo(tab as PortalTabId)} />
    </div>
  )
}
