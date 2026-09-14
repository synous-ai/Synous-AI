'use client'

/**
 * Página de login del CRM admin (hub_user).
 *
 * Usa el componente PRE-ARMADO `<SignIn>` de Clerk (no headless): maneja login
 * por contraseña, "olvidé mi contraseña" y la verificación de dispositivo
 * (Client Trust) de forma nativa y segura. Se integra en el layout 2-columnas
 * con el branding Synous (panel de marca a la izquierda).
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
import './login.css'

/**
 * Apariencia del `<SignIn>` sobre la superficie de marca: Clerk trae su propio
 * tema claro, así que acá se le pasan los tokens del navy para que el form no
 * se vea como una tarjeta blanca pegada encima.
 *
 * Los `elements` apuntan a clases propias definidas en `login.css`, en vez de
 * repetir utilidades sueltas: el form de Clerk tiene muchas partes y mantener
 * su estilo en una hoja aparte deja ver el conjunto de una.
 */
const ADMIN_APPEARANCE = {
  variables: {
    colorPrimary: '#96c0ff',
    colorBackground: 'transparent',
    colorText: '#dadff5',
    colorTextSecondary: '#93a1b4',
    colorInputBackground: '#0a0f21',
    colorInputText: '#dadff5',
    colorDanger: '#ff9a9a',
    borderRadius: '10px',
    fontFamily: 'var(--font-proposal-sans), ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    // White-label: el footer "Secured by Clerk" y el card propio se ocultan
    // porque el form se monta dentro de nuestra columna.
    footer: 'hidden',
    cardBox: 'shadow-none',
    card: 'clerk-card',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    formFieldLabel: 'clerk-label',
    formFieldInput: 'clerk-input',
    formButtonPrimary: 'clerk-submit',
    footerActionLink: 'clerk-link',
    formFieldAction: 'clerk-link',
    identityPreviewEditButton: 'clerk-link',
    formResendCodeLink: 'clerk-link',
    dividerLine: 'clerk-divider-line',
    dividerText: 'clerk-divider-text',
    socialButtonsBlockButton: 'clerk-social',
    otpCodeFieldInput: 'clerk-input',
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
        if (!cancelled) router.replace('/dashboard')
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
    <div className="login-page">
      {/* Panel de marca */}
      <aside className="login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-light" src="/light4.webp" alt="" aria-hidden="true" />
        <div className="login-grain" aria-hidden="true" />
        <div className="login-halo" aria-hidden="true" />

        <div className="login-brand-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/brand/logotipo.svg" alt="Synous AI" />
        </div>

        <div className="login-brand-body">
          <p className="login-badge">
            <span className="login-badge-orb" aria-hidden="true" />
            PANEL INTERNO
          </p>
          <h1 className="login-title">
            Todo el negocio,
            <br />
            en un solo <span className="login-title-accent">lugar</span>.
          </h1>
          <p className="login-lede">
            Pipeline, contactos, empresas y deals. La herramienta que construimos para
            trabajar como queremos trabajar.
          </p>
        </div>

        <div className="login-marks" aria-hidden="true">
          <span className="login-mark" />
          <span className="login-mark" />
          <span className="login-mark" />
        </div>
      </aside>

      {/* Login (componente nativo de Clerk) */}
      <main className="login-form-side">
        <div className="login-form-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo login-logo-mobile" src="/brand/logotipo.svg" alt="Synous AI" />

          <h2 className="login-heading">Iniciá sesión</h2>
          <p className="login-sub">Entrá con tu cuenta del equipo.</p>

          <div className="login-clerk">
            <SignIn routing="hash" forceRedirectUrl="/dashboard" appearance={ADMIN_APPEARANCE} />
          </div>
        </div>
      </main>
    </div>
  )
}
