'use client'

/**
 * Estado compartido de la navegación del Client Portal.
 *
 * Existe porque el sidebar y el contenido viven en archivos DISTINTOS desde
 * que el portal pasó a shell de app: el sidebar se renderiza en
 * `app/portal/(app)/layout.tsx` (rail izquierdo, debajo del header) y los
 * paneles en `app/portal/(app)/page.tsx`. Las secciones NO son rutas — son un
 * panel a la vez sobre el mismo estado — así que sin un contexto el layout no
 * tendría forma de saber qué sección está activa ni de cambiarla.
 *
 * También centraliza el gate del onboarding: el latch del wizard tiene que ser
 * UNO solo. Si el layout y la página lo calcularan por separado, el layout
 * podría seguir mostrando el sidebar mientras la página muestra el wizard.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ElementType } from 'react'
import { House, FileText, ClipboardList, GitPullRequest, Receipt, FolderOpen } from 'lucide-react'
import { useClientOnboarding, usePortalPendingCounts, type PortalPending } from '@portal/lib/hooks'

export type PortalTabId = 'home' | 'deliverables' | 'forms' | 'requests' | 'invoices' | 'documents'

const TABS: { id: PortalTabId; label: string; Icon: ElementType }[] = [
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
const BADGE_BY_TAB: Partial<Record<PortalTabId, (p: PortalPending) => number>> = {
  deliverables: (p) => p.counts.deliverables,
  forms: (p) => p.counts.forms,
  requests: (p) => p.counts.requests,
  invoices: (p) => p.counts.invoices,
}

export interface PortalNavItem {
  id: PortalTabId
  label: string
  Icon: ElementType
  /** Ítems que esperan acción del cliente. 0 ⇒ sin badge. */
  badge: number
}

interface PortalNavValue {
  items: PortalNavItem[]
  activeTab: PortalTabId
  setActiveTab: (id: PortalTabId) => void
  collapsed: boolean
  toggleCollapsed: () => void
  onboarding: {
    loading: boolean
    isError: boolean
    wizardActive: boolean | null
    dismiss: () => void
  }
}

const PortalNavContext = createContext<PortalNavValue | null>(null)

/**
 * Gating del onboarding post-venta: mientras `client_onboarding.status !==
 * 'completed'`, el wizard de 8 pasos reemplaza al portal entero (sin sidebar).
 *
 * `wizardActive` se decide UNA sola vez con los primeros datos que llegan
 * (`null` = todavía no se sabe → skeleton neutro) y después NO se vuelve a
 * recalcular a partir de refetches de la query — solo cambia cuando el propio
 * wizard llama a `dismiss` (botón "Ir a mi Portal" en la pantalla de cierre).
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

export function PortalNavProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<PortalTabId>('home')
  const [collapsed, setCollapsed] = useState(false)
  const pending = usePortalPendingCounts()
  const onboarding = useOnboardingGate()

  const items = useMemo<PortalNavItem[]>(
    () =>
      TABS.map(({ id, label, Icon }) => ({
        id,
        label,
        Icon,
        badge: BADGE_BY_TAB[id]?.(pending) ?? 0,
      })),
    [pending],
  )

  const value: PortalNavValue = {
    items,
    activeTab,
    setActiveTab,
    collapsed,
    toggleCollapsed: () => setCollapsed((v) => !v),
    onboarding,
  }

  return <PortalNavContext.Provider value={value}>{children}</PortalNavContext.Provider>
}

export function usePortalNav(): PortalNavValue {
  const ctx = useContext(PortalNavContext)
  if (!ctx) throw new Error('usePortalNav debe usarse dentro de <PortalNavProvider>')
  return ctx
}
