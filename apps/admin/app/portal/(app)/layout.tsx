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
import { Instrument_Serif } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useAuth, useUser, useClerk } from '@clerk/nextjs'
import { LogOut, Palette } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { Button } from '@portal/components/ui/button'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { useBranding } from '@portal/components/branding/branding-provider'

const editorialSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-editorial-serif',
  display: 'swap',
})

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { brand } = useBranding()

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
        <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
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
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
          <div className="space-y-4">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-[40vh] w-full rounded-2xl" />
          </div>
        </main>
      </SkeletonGroup>
    )
  }

  // Email del usuario autenticado (viene del perfil Clerk, no de un JWT propio).
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''

  return (
    <div className={cn('portal-editorial flex min-h-screen flex-col', editorialSerif.variable)}>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            {brand?.logoUrl ? (
              // Dimensiones explícitas + lazy: reservan el espacio antes de cargar
              // (evita CLS). El logo viene de R2/API (host dinámico), por eso <img>.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.brandName ?? 'logo'}
                width={28}
                height={28}
                loading="lazy"
                className="h-7 w-7 rounded-lg object-contain"
              />
            ) : null}
            <span className="font-editorial text-lg italic tracking-wide text-foreground">
              {brand?.brandName ?? 'NOUS · Portal'}
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground sm:mr-2 sm:block">{email}</span>
            <Button variant="ghost" size="sm" asChild className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground">
              <Link href="/portal/marca">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Mi Marca</span>
              </Link>
            </Button>
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

      {/* Main content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
