'use client'

/**
 * Layout protegido del portal de cliente — CA2 (Clerk).
 *
 * El middleware ya bloquea /portal/* para usuarios sin sesión Clerk, pero
 * mantenemos el guard acá por doble seguridad en el cliente y para manejar
 * el estado de carga (isLoaded) antes de renderizar.
 *
 * RESTYLE (editorial oscuro): este layout es el ÚNICO punto donde se aplica
 * `.portal-editorial` (ver portal-theme.css) — scopea el negro-casi-puro con
 * textura de puntos + la serif display a TODO lo que cuelga de acá (sidebar,
 * secciones, wizard de onboarding), sin tocar /portal/login ni
 * /portal/accept-invitation, que quedan en `.portal-theme` (Fynix claro/oscuro
 * original). Es dark-only a propósito, así que el toggle de tema no tiene
 * sentido acá adentro y se quitó.
 *
 * ─── Shell de app ───────────────────────────────────────────────────────────
 * El header va ARRIBA de todo, a lo ancho de la ventana. Debajo, dos columnas:
 * el rail de navegación a la IZQUIERDA y el contenido a la derecha. El sidebar
 * vive acá y no en cada página porque es cromo del shell: tiene que quedar fijo
 * mientras el contenido scrollea y existir en TODAS las secciones.
 *
 * El gate del onboarding también vive acá, no en las páginas: con cada sección
 * siendo una ruta propia, ponerlo en cada una dejaría el gate a merced de que
 * nadie se olvide. Acá cubre todo lo que cuelgue del layout por construcción.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { Averia_Serif_Libre } from 'next/font/google'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { UserButton } from '@clerk/nextjs'
import { cn } from '@portal/lib/utils'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { ClientNotificationBell } from '@portal/components/portal/notification-bell'
import { PortalSidebar } from '@portal/components/portal/portal-sidebar'
import { ClientOnboardingWizard } from '@portal/components/onboarding/client-onboarding-wizard'
import {
  PortalNavProvider,
  portalHref,
  usePortalNav,
  type PortalTabId,
} from '@portal/components/portal/portal-nav'

// Display font for the brand mark and every heading in the portal shell.
// Paired with Plus Jakarta Sans (body) — two typefaces total, no more.
const editorialSerif = Averia_Serif_Libre({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-editorial-serif',
  display: 'swap',
})

/** Rail del header: a lo ancho, alineado con el borde del sidebar. */
const HEADER_RAIL = 'flex h-16 items-center justify-between px-4 sm:px-6'
/** Ancho de lectura del contenido, dentro de la columna derecha. */
const CONTENT_RAIL = 'mx-auto w-full max-w-[1140px] px-4 py-8 sm:px-6'
/** Hueco del rail: mismo ancho que el sidebar, para que el contenido no salte. */
const RAIL_PLACEHOLDER =
  'hidden shrink-0 border-r border-border lg:block lg:h-[calc(100dvh-4rem)] lg:w-[240px]'

/**
 * Columnas del shell. Es un componente aparte porque `usePortalNav()` solo se
 * puede llamar DENTRO del provider, no en el mismo componente que lo renderiza.
 */
function PortalShellBody({ children }: { children: React.ReactNode }) {
  const { items, activeTab, goTo, collapsed, toggleCollapsed, onboarding } = usePortalNav()

  // El wizard reemplaza al portal entero: pantalla completa, sin rail. Navegar
  // a otra sección sin haberlo terminado no tiene sentido.
  if (onboarding.wizardActive) {
    return (
      <main className="min-w-0 flex-1">
        <div className={CONTENT_RAIL}>
          <ClientOnboardingWizard onFinish={onboarding.dismiss} />
        </div>
      </main>
    )
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
      {onboarding.loading ? (
        /* Reserva del rail mientras se resuelve el onboarding. Sin esto el
           contenido monta a ancho completo y salta 240px cuando aparece. */
        <div aria-hidden className={RAIL_PLACEHOLDER} />
      ) : (
        <PortalSidebar
          items={items}
          // null (rutas que no son sección, como /marca) ⇒ ninguna activa.
          activeId={activeTab ?? ''}
          onSelect={(id) => goTo(id as PortalTabId)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      )}

      {/*
        `min-w-0`: un hijo de flex arranca con min-width:auto, así que una tabla
        ancha o un nombre de archivo largo empujarían el ancho y desbordarían el
        layout en vez de scrollear dentro de su panel.
      */}
      <main className="min-w-0 flex-1">
        <div className={CONTENT_RAIL}>
          {onboarding.loading ? (
            /* Neutro a propósito: todavía no sabemos si corresponde el wizard o
               la sección, y adelantar cualquiera de los dos genera un flash. */
            <SkeletonGroup label="Cargando tu portal…" className="space-y-4">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-[40vh] w-full rounded-2xl" />
            </SkeletonGroup>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useAuth()

  // Guard del lado cliente: si Clerk cargó y no hay sesión, ir a login.
  // El middleware ya bloquea antes de llegar acá, pero cubrimos el caso
  // de sesión expirada durante la navegación.
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/portal/login')
  }, [isLoaded, isSignedIn, router])

  // Pantalla de carga mientras Clerk verifica la sesión.
  if (!isLoaded || !isSignedIn) {
    return (
      <SkeletonGroup
        label="Cargando portal…"
        className={cn('portal-editorial flex min-h-screen flex-col', editorialSerif.variable)}
      >
        <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className={HEADER_RAIL}>
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
          <div aria-hidden className={RAIL_PLACEHOLDER} />
          <main className="min-w-0 flex-1">
            <div className={cn(CONTENT_RAIL, 'space-y-4')}>
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-[40vh] w-full rounded-2xl" />
            </div>
          </main>
        </div>
      </SkeletonGroup>
    )
  }

  return (
    <div className={cn('portal-editorial flex min-h-screen flex-col', editorialSerif.variable)}>
      {/* Header: brand mark on one side, account controls on the other. The
          client cannot re-brand the portal, so no "Mi Marca" entry point. */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className={HEADER_RAIL}>
          {/* Al Inicio del portal, NO a `/`: fuera de un host de tenant, `/`
              es la landing pública. `portalHref` respeta el prefijo actual. */}
          <Link href={portalHref(pathname, 'dashboard')} className="font-editorial text-lg tracking-wide text-foreground">
            Synous <span className="text-muted-foreground">· Portal</span>
          </Link>

          <div className="flex items-center gap-2">
            <ClientNotificationBell />
            {/* El logout vive en el popover del UserButton. Su destino es
                configuración de INSTANCIA en Clerk (no hay prop acá, y el
                ClerkProvider es uno solo para admin + portal, así que ponerlo
                global mandaría a los admins al login del cliente). Mientras
                tanto el guard de arriba cubre el caso: al caer isSignedIn,
                este layout redirige a /portal/login por su cuenta. */}
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'h-8 w-8',
                  userButtonPopoverCard: 'bg-card border border-border',
                },
              }}
            />
          </div>
        </div>
      </header>

      <PortalNavProvider>
        <PortalShellBody>{children}</PortalShellBody>
      </PortalNavProvider>
    </div>
  )
}
