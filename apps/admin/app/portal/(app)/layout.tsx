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
 * textura de puntos + la serif display a TODO lo que cuelga de acá (tabs,
 * paneles, wizard de onboarding), sin tocar /portal/login ni
 * /portal/accept-invitation, que quedan en `.portal-theme` (Fynix claro/oscuro
 * original). Es dark-only a propósito, así que el toggle de tema no tiene
 * sentido acá adentro y se quitó (el ThemeProvider global sigue existiendo
 * para el admin y para el login del portal).
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

// Display font for the brand mark and every heading in the portal shell.
// Paired with Plus Jakarta Sans (body) — two typefaces total, no more.
const editorialSerif = Averia_Serif_Libre({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-editorial-serif',
  display: 'swap',
})

/** Shared shell width — matches the wizard frame (1140px on desktop). */
const SHELL_WIDTH = 'mx-auto w-full max-w-[1140px] px-4 sm:px-6'

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
          <div className={cn(SHELL_WIDTH, 'flex h-16 items-center justify-between')}>
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
        <main className={cn(SHELL_WIDTH, 'flex-1 py-8')}>
          <div className="space-y-4">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-[40vh] w-full rounded-2xl" />
          </div>
        </main>
      </SkeletonGroup>
    )
  }

  return (
    <div className={cn('portal-editorial flex min-h-screen flex-col', editorialSerif.variable)}>
      {/* Header: brand mark on one side, account controls on the other. The
          client cannot re-brand the portal, so no "Mi Marca" entry point. */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className={cn(SHELL_WIDTH, 'flex h-16 items-center justify-between')}>
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

      {/* Main content — same rail as the header so everything lines up. */}
      <main className={cn(SHELL_WIDTH, 'flex-1 py-8')}>{children}</main>
    </div>
  )
}
