'use client'

/**
 * Navegación del Client Portal: catálogo de secciones + estado compartido.
 *
 * ─── Las secciones son RUTAS, no estado ─────────────────────────────────────
 * Cada sección tiene su propia URL (`/deliverables`, `/invoices`, …). El `id`
 * de la sección ES el segmento de la URL: una sola fuente de verdad, así que no
 * puede existir un link a una sección que el sidebar no conozca, ni al revés.
 *
 * Antes esto era `useState` + `?tab=`. Con rutas reales se gana lo que el
 * estado local no puede dar: cada sección es enlazable, indexable por el
 * historial del browser, y el `<ClientNotificationBell>` —que vive en el
 * header, FUERA de este provider— puede mandarte a cualquier lado con un
 * `router.push` sin saber que este contexto existe.
 *
 * ─── Los dos prefijos ───────────────────────────────────────────────────────
 * El portal se sirve de dos formas y las dos son válidas a la vez:
 *
 *   uirtus.synousai.com/deliverables   ← host de tenant; el middleware hace
 *                                        rewrite interno a /portal/deliverables
 *   cualquier-host/portal/deliverables ← la ruta FÍSICA del App Router
 *
 * Por eso `portalBase()` mira el pathname visible en vez de adivinar por host o
 * por cookie: si estamos bajo `/portal`, los links se arman con ese prefijo; si
 * no, se arman limpios. El mismo componente sirve las dos formas sin ramas.
 *
 * También centraliza el gate del onboarding: el latch del wizard tiene que ser
 * UNO solo, porque lo consume el layout (decide si monta el shell o el wizard).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ElementType,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { House, FileText, ClipboardList, GitPullRequest, Receipt, FolderOpen } from 'lucide-react'
import { useClientOnboarding, usePortalPendingCounts, type PortalPending } from '@portal/lib/hooks'

/** El id de la sección ES su segmento de URL. No hay mapa que mantener. */
export type PortalTabId =
  | 'dashboard'
  | 'deliverables'
  | 'forms'
  | 'requests'
  | 'invoices'
  | 'documents'

const TABS: { id: PortalTabId; label: string; Icon: ElementType }[] = [
  { id: 'dashboard', label: 'Inicio', Icon: House },
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

const PORTAL_PREFIX = '/portal'

/** `/portal` si la URL visible lleva el prefijo físico; string vacío si es limpia. */
export function portalBase(pathname: string): string {
  return pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`) ? PORTAL_PREFIX : ''
}

/** Arma el href de una sección respetando el prefijo con el que se está sirviendo. */
export function portalHref(pathname: string, id: PortalTabId): string {
  return `${portalBase(pathname)}/${id}`
}

/**
 * Qué sección corresponde al pathname actual. `null` a propósito para rutas que
 * NO son secciones (`/marca`): ahí el sidebar no marca ninguna como activa, en
 * vez de mentir resaltando Inicio.
 */
function sectionFrom(pathname: string): PortalTabId | null {
  const rest = pathname.slice(portalBase(pathname).length)
  const segment = rest.split('/').filter(Boolean)[0]
  if (!segment) return 'dashboard'
  return TABS.some((t) => t.id === segment) ? (segment as PortalTabId) : null
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
  /** Sección activa, o null si la ruta actual no es una sección. */
  activeTab: PortalTabId | null
  /** Navega a una sección respetando el prefijo actual. */
  goTo: (id: PortalTabId) => void
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
 * 'completed'`, el wizard de 8 pasos reemplaza al portal entero.
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
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const pending = usePortalPendingCounts()
  const onboarding = useOnboardingGate()

  const activeTab = sectionFrom(pathname)

  const goTo = useCallback(
    (id: PortalTabId) => {
      // `scroll: false`: al cambiar de sección el shell no se mueve, así que
      // saltar al tope sería un movimiento gratuito.
      router.push(portalHref(pathname, id), { scroll: false })
    },
    [router, pathname],
  )

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
    goTo,
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
