'use client'

/**
 * Layout protegido del portal de cliente — CA2 (Clerk).
 *
 * El middleware ya bloquea /portal/* para usuarios sin sesión Clerk, pero
 * mantenemos el guard acá por doble seguridad en el cliente y para manejar
 * el estado de carga (isLoaded) antes de renderizar.
 *
 * El logout usa signOut() de Clerk (invalida la sesión en el servidor).
 * Redirige a /portal/login (que muestra el <SignIn> de Clerk).
 *
 * RESTYLE (editorial oscuro): este layout es el ÚNICO punto donde se aplica
 * `.portal-editorial` (ver portal-theme.css) — scopea el negro-casi-puro con
 * textura de puntos + la serif display a TODO lo que cuelga de acá (sidebar,
 * paneles, wizard de onboarding), sin tocar /portal/login ni
 * /portal/accept-invitation, que quedan en `.portal-theme` (Fynix claro/oscuro
 * original). Es dark-only a propósito, así que el toggle de tema no tiene
 * sentido acá adentro y se quitó (el ThemeProvider global sigue existiendo
 * para el admin y para el login del portal).
 *
 * ─── Shell de app ───────────────────────────────────────────────────────────
 * El header va ARRIBA de todo, a lo ancho de la ventana. Debajo, dos columnas:
 * el rail de navegación a la IZQUIERDA y el contenido a la derecha. El sidebar
 * vive acá y no en la página porque es cromo del shell: tiene que quedar fijo
 * mientras el contenido scrollea, y tiene que existir en cualquier ruta del
 * portal. El estado de qué sección está activa lo comparte con la página vía
 * `PortalNavProvider` — las secciones NO son rutas.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { Averia_Serif_Libre } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { UserButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { Button } from '@portal/components/ui/button'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { ClientNotificationBell } from '@portal/components/portal/notification-bell'
import { PortalSidebar } from '@portal/components/portal/portal-sidebar'
import { PortalNavProvider, usePortalNav } from '@portal/components/portal/portal-nav'

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

/**
 * Columnas del shell. Es un componente aparte porque `usePortalNav()` solo se
 * puede llamar DENTRO del provider, no en el mismo componente que lo renderiza.
 *
 * Mientras el wizard de onboarding está activo (o mientras todavía no se sabe),
 * el sidebar no se monta: el wizard es pantalla completa y navegar a otra
 * sección sin haberlo terminado no tiene sentido.
 */
function PortalShellBody({ children }: { children: React.ReactNode }) {
  const { items, activeTab, setActiveTab, collapsed, toggleCollapsed, onboarding } = usePortalNav()
  const showNav = !onboarding.loading && !onboarding.wizardActive

  return (
    <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
      {showNav && (
        <PortalSidebar
          items={items}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as typeof activeTab)}
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
        <div className={CONTENT_RAIL}>{children}</div>
      </main>
    </div>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { signOut } = useClerk()

  // Guard del lado cliente: si Clerk cargó y no hay sesión, ir a login.
  // El middleware ya bloquea antes de llegar acá, pero cubrimos el caso
  // de sesión expirada durante la navegación.
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/portal/login')
  }, [isLoaded, isSignedIn, router])

  async function handleLogout() {
    // signOut() invalida la sesión Clerk en el servidor y limpia las cookies.
    await signOut()
    router.replace('/portal/login')
  }

  // Pantalla de carga mientras Clerk verifica la sesión.
  if (!isLoaded || !isSignedIn) {
    return (
      <SkeletonGroup
        label="Cargando portal…"
        className={cn('portal-editorial flex min-h-screen flex-col', editorialSerif.variable)}
      >
        {/* Skeleton del header */}
        <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className={HEADER_RAIL}>
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </div>
        {/* Contenido NEUTRO: este skeleton se muestra mientras Clerk verifica la
            sesión, para CUALQUIER ruta del portal (home, entregables, formularios,
            facturas, documentos, marca). Por eso NO imita el Home — cada panel
            monta su propio skeleton fiel al cargar sus datos. Si acá imitáramos el
            Home, al entrar a otra ruta se verían dos skeletons distintos seguidos. */}
        <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
          {/* Hueco del rail, para que el contenido no salte cuando aparezca. */}
          <div className="hidden w-[240px] shrink-0 border-r border-border lg:block lg:h-[calc(100dvh-4rem)]" />
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
          <Link href="/portal" className="font-editorial text-lg tracking-wide text-foreground">
            Synous <span className="text-muted-foreground">· Portal</span>
          </Link>

          <div className="flex items-center gap-2">
            <ClientNotificationBell />
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'h-8 w-8',
                  userButtonPopoverCard: 'bg-card border border-border',
                },
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </header>

      <PortalNavProvider>
        <PortalShellBody>{children}</PortalShellBody>
      </PortalNavProvider>
    </div>
  )
}
