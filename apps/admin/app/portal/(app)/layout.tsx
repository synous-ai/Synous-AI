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
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useAuth, useUser, useClerk } from '@clerk/nextjs'
import { LogOut, Sun, Moon, Palette } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { useBranding } from '@portal/components/branding/branding-provider'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { resolvedTheme, setTheme } = useTheme()
  const { brand } = useBranding()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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
      <SkeletonGroup label="Cargando portal…" className="flex min-h-screen flex-col">
        {/* Skeleton del header */}
        <div className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
        {/* Skeleton del contenido — fiel a: título + descripción + grid de summary cards */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
          <div className="space-y-4">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72" />
            {/* Grid 2x2 de SummaryCards */}
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-5 w-6 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-8 w-28 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </SkeletonGroup>
    )
  }

  // Email del usuario autenticado (viene del perfil Clerk, no de un JWT propio).
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
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
            <span className="font-display text-sm font-semibold">{brand?.brandName ?? 'NOUS · Portal'}</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:block">{email}</span>
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link href="/portal/marca">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Mi Marca</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label={mounted && resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="h-8 w-8"
            >
              {mounted ? (
                resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
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
