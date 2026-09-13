'use client'

/**
 * Página de login del portal de cliente — CA2 (Clerk).
 *
 * Usa el componente <SignIn> pre-armado de @clerk/nextjs para dar:
 *  - Login email + contraseña
 *  - "Olvidé mi contraseña" (recuperación para cuentas ya activadas)
 *  - Verificación de dispositivo (Client Trust) sin código extra.
 *
 * El primer ingreso se hace desde el link de invitación (`/portal/accept-invitation`),
 * no desde acá — acá sólo se loguean clientes que ya activaron su cuenta.
 *
 * signUpUrl se omite deliberadamente: los clientes se provisionan por el admin
 * (activateClientPortal), no hay self sign-up disponible.
 *
 * Comparte el diseño del login del panel interno: mismo layout, mismo badge,
 * mismo tratamiento del form de Clerk. Lo que cambia es el valor — el panel es
 * navy porque el equipo vive ahí todo el día; el portal es claro porque el
 * cliente entra un rato, muchas veces desde el teléfono.
 *
 * El nombre del negocio sale del branding del tenant (cookie `dd_tenant` →
 * `/api/public/branding/:slug`), así el cliente entra a algo que lo nombra.
 */

import { SignIn, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { API_URL } from '@synous/shared'
import { apiGet } from '@portal/lib/api'
import './login.css'

/**
 * Subconjunto de la respuesta de GET /api/public/branding/:slug.
 * Solo exponemos los campos que necesitamos para el login; el endpoint no
 * devuelve datos sensibles del cliente (ver branding.service.ts).
 */
interface PublicBranding {
  brandName: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
}

/**
 * Apariencia del `<SignIn>` sobre la superficie clara del portal. Clerk trae su
 * propio tema y sin estos tokens el form se ve como una pieza ajena encima.
 *
 * Los `elements` apuntan a clases propias definidas en `login.css`, en vez de
 * repetir utilidades sueltas: el form tiene muchas partes y mantener su estilo
 * en una hoja aparte deja ver el conjunto de una.
 */
const PORTAL_APPEARANCE = {
  variables: {
    colorPrimary: '#1c73ca',
    colorBackground: 'transparent',
    colorText: '#0f1729',
    colorTextSecondary: '#5c6b82',
    colorInputBackground: '#ffffff',
    colorInputText: '#0f1729',
    colorDanger: '#c0392b',
    borderRadius: '10px',
    fontFamily: 'var(--font-portal-sans), ui-sans-serif, system-ui, sans-serif',
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

/**
 * Lee el slug del tenant desde la cookie `dd_tenant`.
 * El middleware lo setea cuando el usuario entra por subdominio o /c/<slug>.
 * Retorna null en SSR o si no hay cookie.
 */
function readSlugCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)dd_tenant=([^;]+)/)
  return m?.[1] != null ? decodeURIComponent(m[1]) : null
}

export default function PortalLoginPage() {
  const [branding, setBranding] = useState<PublicBranding | null>(null)
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  // Con sesión de Clerk activa el <SignIn> no se monta (queda un panel vacío).
  // Pero NO redirigimos a ciegas a /portal: si la sesión no corresponde a un
  // client_account vinculado (p. ej. admin, o cuenta re-vinculada), el backend
  // devuelve 401 y se generaba un loop de recarga login → portal → 401 → login.
  // Verificamos la sesión contra /api/client-auth/me: si es de cliente → /portal;
  // si no, el onAuthFailure del api-client cierra la sesión huérfana y el form
  // se monta solo cuando isSignedIn pasa a false.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    apiGet<{ id: string }>('/api/client-auth/me')
      .then(() => {
        if (!cancelled) router.replace('/portal')
      })
      .catch(() => {
        // 401 → onAuthFailure ya cerró la sesión de Clerk (sin redirigir porque
        // estamos en /portal/login); el <SignIn> se monta al flip de isSignedIn.
      })
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    const slug = readSlugCookie()
    if (!slug) return

    // Fetch público — no lleva token ni credenciales.
    fetch(`${API_URL}/api/public/branding/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) return
        const json = (await res.json()) as { data: PublicBranding | null }
        if (json.data) setBranding(json.data)
      })
      .catch(() => {
        // Red, CORS o servidor caído → se muestra el saludo genérico.
      })
  }, [])

  const brandName = branding?.brandName

  return (
    <div className="portal-login">
      {/* Panel de marca */}
      <aside className="portal-login-brand">
        <div className="portal-login-grain" aria-hidden="true" />
        <div className="portal-login-halo" aria-hidden="true" />

        <div className="portal-login-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="portal-login-logo" src="/brand/logotipo.svg" alt="Synous AI" />
        </div>

        <div className="portal-login-body">
          <p className="portal-login-badge">
            <span className="portal-login-orb" aria-hidden="true" />
            PORTAL DE CLIENTE
          </p>
          <h1 className="portal-login-title">
            {brandName ? (
              <>
                El sistema de{' '}
                <span className="portal-login-title-accent">{brandName}</span>.
              </>
            ) : (
              <>
                Su sistema,
                <br />
                y todo lo que pasa <span className="portal-login-title-accent">adentro</span>.
              </>
            )}
          </h1>
          <p className="portal-login-lede">
            Acá vive el proyecto: en qué anda, qué se entregó, qué espera una decisión suya.
            Sin pedirnos novedades por mensaje.
          </p>
        </div>

        <div className="portal-login-marks" aria-hidden="true">
          <span className="portal-login-mark" />
          <span className="portal-login-mark" />
          <span className="portal-login-mark" />
        </div>
      </aside>

      {/* Login (componente nativo de Clerk) */}
      <main className="portal-login-form-side">
        <div className="portal-login-dots" aria-hidden="true" />

        <div className="portal-login-form-inner">
          {/* Variante en tinta: sobre papel, el logotipo claro desaparece. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="portal-login-logo portal-login-logo-mobile"
            src="/brand/logotipo-ink.svg"
            alt="Synous AI"
          />

          <h2 className="portal-login-heading">Iniciá sesión</h2>
          <p className="portal-login-sub">
            {brandName ? `Accedé al portal de ${brandName}.` : 'Accedé al portal de tu proyecto.'}
          </p>

          <div className="portal-login-clerk">
            <SignIn routing="hash" forceRedirectUrl="/portal" appearance={PORTAL_APPEARANCE} />
          </div>
        </div>
      </main>
    </div>
  )
}
