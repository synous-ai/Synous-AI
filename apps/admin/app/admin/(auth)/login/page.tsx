'use client'

/**
 * Página de login del CRM admin (hub_user).
 *
 * Usa el componente PRE-ARMADO `<SignIn>` de Clerk (no headless): maneja login
 * por contraseña, "olvidé mi contraseña" y la verificación de dispositivo
 * (Client Trust) de forma nativa y segura. Se integra en el layout 2-columnas
 * con el branding NOUS (panel de marca a la izquierda).
 *
 * Por qué `<SignIn>` y no un form propio: el form headless con inputs `name`
 * podía caer a un submit NATIVO (GET) antes de hidratar y exponer credenciales
 * en la URL. `<SignIn>` no tiene ese riesgo y centraliza todo el flujo en Clerk.
 *
 * GUARD DE SESIÓN ACTIVA: el `<SignIn>` prearmado de Clerk NO se monta si el
 * navegador ya tiene una sesión. Sin el guard de abajo, quien llegaba acá con
 * una sesión que no es de hub_user (típico: haber entrado antes al portal como
 * cliente en el mismo navegador) veía un panel VACÍO y no podía loguearse —
 * parece un bug de la página, pero es Clerk haciendo lo suyo. Mismo fix que ya
 * tiene app/portal/(auth)/login/page.tsx.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SignIn, useAuth } from '@clerk/nextjs'
import { apiGet } from '@/lib/api'

// Apariencia del <SignIn> alineada al admin (monocromo, sin tinte azul de Clerk).
const ADMIN_APPEARANCE = {
  variables: {
    colorPrimary: '#0a0a0a',
    borderRadius: '0.625rem',
  },
  elements: {
    // White-label: ocultamos el footer "Secured by Clerk" y el card propio
    // (lo montamos dentro de nuestra columna).
    footer: 'hidden',
    cardBox: 'shadow-none',
    card: 'shadow-none bg-transparent',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
  },
} as const

export default function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  // Con sesión activa NO redirigimos a ciegas al dashboard: si la sesión no es
  // de un hub_user (p. ej. un cliente del portal), el backend devuelve 401 y se
  // arma el ciclo login → dashboard → 401 → login. Verificamos contra
  // /api/auth/me: si es del equipo → dashboard; si no, el onAuthFailure del
  // api-client cierra la sesión huérfana y el <SignIn> se monta solo cuando
  // isSignedIn pasa a false.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    apiGet<{ id: string }>('/api/auth/me')
      .then(() => {
        if (!cancelled) router.replace('/admin/dashboard')
      })
      .catch(() => {
        // 401 → onAuthFailure ya cerró la sesión (sin navegar, porque estamos
        // en /admin/login). El form aparece al flip de isSignedIn.
      })
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, router])

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(hsl(var(--background)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-background/10 blur-[80px]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-background/20 font-display text-lg font-medium text-background">
            N
          </span>
          <span className="eyebrow text-background/70">NOUS · CRM interno</span>
        </div>

        <div className="relative">
          <h1 className="font-display text-6xl font-medium leading-[0.95] tracking-tight">
            El negocio,
            <br />
            de punta
            <br />
            a punta.
          </h1>
          <p className="mt-6 max-w-sm text-background/60">
            Pipeline, contactos, empresas y deals — todo en una sola herramienta hecha a medida.
          </p>
        </div>

        <p className="relative font-mono text-xs text-background/40">app.nous.com</p>
      </div>

      {/* Login (componente nativo de Clerk) */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="eyebrow">Acceso</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight">Iniciá sesión</h2>
          <p className="mt-1 text-sm text-muted-foreground">Entrá con tu cuenta del equipo.</p>

          <div className="mt-6">
            <SignIn
              routing="hash"
              forceRedirectUrl="/admin/dashboard"
              appearance={ADMIN_APPEARANCE}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
