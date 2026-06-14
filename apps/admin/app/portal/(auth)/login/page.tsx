'use client'

/**
 * Página de login del portal de cliente — CA2 (Clerk).
 *
 * Usa el componente <SignIn> pre-armado de @clerk/nextjs para dar:
 *  - Login email + contraseña
 *  - "Olvidé mi contraseña" (flujo de reset — los clientes entran por acá la
 *    primera vez ya que activateClientPortal genera su cuenta con password random).
 *  - Verificación de dispositivo (Client Trust) sin código extra.
 *
 * signUpUrl se omite deliberadamente: los clientes se provisionan por el admin
 * (activateClientPortal), no hay self sign-up disponible.
 *
 * El appearance se resuelve dinámicamente:
 *  - Si hay cookie `dd_tenant` → fetch público a /api/public/branding/:slug
 *  - Si el cliente tiene branding configurado → se aplica su paleta y logo
 *  - Fallback: PORTAL_APPEARANCE (verde NOUS genérico) en cualquier caso de error
 *    o ausencia de tenant
 */

import { SignIn } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { API_URL } from '@nous/shared'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Appearance genérico NOUS ─────────────────────────────────────────────────

/**
 * Paleta verde del portal (refleja las variables de portal-theme.css).
 * Clerk acepta hex/hsl directamente; mapeamos los valores del theme.
 * Se usa como fallback cuando no hay tenant o el fetch de branding falla.
 */
/**
 * Tipado del objeto appearance de Clerk que usamos.
 * No importamos el tipo de Clerk directamente para evitar acoplamiento a la versión;
 * definimos solo las propiedades que realmente tocamos.
 */
interface PortalAppearance {
  variables: {
    colorPrimary: string
    colorBackground: string
    colorText: string
    colorTextSecondary: string
    colorInputBackground: string
    borderRadius: string
    fontFamily: string
  }
  elements: {
    card: string
    formButtonPrimary: string
    footer: string
    headerTitle: string
    headerSubtitle: string
  }
}

const PORTAL_APPEARANCE: PortalAppearance = {
  variables: {
    // Verde bosque oscuro (--primary light: hsl(155, 47%, 15%))
    colorPrimary: '#0f2d1f',
    // Fondo verdoso claro (--background light: hsl(140, 14%, 96%))
    colorBackground: '#f3f5f3',
    // Texto principal (--foreground light: hsl(156, 30%, 13%))
    colorText: '#161f18',
    // Texto secundario (--muted-foreground light: hsl(150, 6%, 43%))
    colorTextSecondary: '#687068',
    // Input sin tinte para máxima legibilidad
    colorInputBackground: '#ffffff',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-portal-sans), ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    // Card centrada dentro del panel de formulario — sin sombra extra.
    card: 'shadow-none border border-[hsl(145,13%,89%)] bg-white',
    // Botón primario: usar el verde oscuro del portal.
    formButtonPrimary:
      'bg-[hsl(155,47%,15%)] text-[hsl(140,30%,97%)] hover:bg-[hsl(155,47%,12%)]',
    // Ocultar el footer de Clerk ("Secured by Clerk") — portal white-label.
    footer: 'hidden',
    // Ocultar el header del componente Clerk (usamos el nuestro, arriba).
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lee el slug del tenant desde la cookie `dd_tenant`.
 * El middleware lo setea cuando el usuario entra por subdominio o /c/<slug>.
 * Mismo regex que usa BrandingProvider para mantener consistencia.
 * Retorna null en SSR o si no hay cookie.
 */
function readSlugCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)dd_tenant=([^;]+)/)
  return m?.[1] != null ? decodeURIComponent(m[1]) : null
}

/**
 * Construye el objeto `appearance` de Clerk usando el color primario del cliente.
 * Solo sobreescribe colorPrimary y formButtonPrimary para mantener coherencia con
 * el resto del estilo (border-radius, fonts, ocultar footer/header del Clerk, etc.).
 *
 * @param primaryColor - Hex del color primario del cliente (ej: "#3b82f6")
 */
function buildBrandedAppearance(primaryColor: string): PortalAppearance {
  return {
    variables: {
      ...PORTAL_APPEARANCE.variables,
      colorPrimary: primaryColor,
    },
    elements: {
      ...PORTAL_APPEARANCE.elements,
      // El botón usa el color primario del cliente en lugar del verde NOUS.
      // Dejamos la clase vacía para que Clerk aplique el colorPrimary de variables
      // en lugar de la clase utilitaria verde fija.
      formButtonPrimary: '',
    },
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PortalLoginPage() {
  // Estado de branding: null → cargando / sin tenant (usa fallback inmediato)
  const [branding, setBranding] = useState<PublicBranding | null>(null)
  // Indica si ya terminamos el intento de fetch (para no mostrar flash al hacer fallback)
  const [brandingResolved, setBrandingResolved] = useState(false)

  useEffect(() => {
    const slug = readSlugCookie()

    // Sin tenant → no hacemos fetch; mostramos el genérico directamente.
    if (!slug) {
      setBrandingResolved(true)
      return
    }

    // Fetch público — no lleva token ni credenciales.
    // El endpoint devuelve { data: PublicBranding | null }.
    fetch(`${API_URL}/api/public/branding/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) return
        const json = (await res.json()) as { data: PublicBranding | null }
        if (json.data) setBranding(json.data)
      })
      .catch(() => {
        // Fetch falló (red, CORS, servidor caído) → fallback silencioso al genérico NOUS.
      })
      .finally(() => {
        setBrandingResolved(true)
      })
  }, [])

  // Appearance final: si el cliente tiene color primario lo usamos; si no, el genérico.
  const appearance =
    branding?.primaryColor != null
      ? buildBrandedAppearance(branding.primaryColor)
      : PORTAL_APPEARANCE

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>

      <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        {/* Panel de marca — visible solo en desktop */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(hsl(var(--background)) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* Acento visual en la esquina — usa el color primario del cliente si está disponible */}
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/90 blur-[2px]" />

          <div className="relative flex items-center gap-3">
            {branding?.logoUrl != null ? (
              /*
               * Logo del cliente: lo mostramos solo cuando el branding está resuelto
               * y hay URL. Con brandingResolved evitamos el flash de "N" → logo del cliente.
               */
              brandingResolved ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt={branding.brandName ?? 'Logo del cliente'}
                  className="h-9 w-auto object-contain"
                />
              ) : (
                /* Placeholder neutro mientras carga — evita flash de letras */
                <span className="flex h-9 w-9 rounded-md bg-white/10" />
              )
            ) : (
              /* Sin branding o branding sin logo → monograma NOUS genérico */
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-signal font-display text-lg font-bold text-signal-foreground">
                N
              </span>
            )}

            <span className="eyebrow text-background/70">
              {brandingResolved && branding?.brandName != null
                ? branding.brandName
                : 'NOUS · Portal de clientes'}
            </span>
          </div>

          <div className="relative">
            <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tight">
              Tu proyecto,
              <br />
              siempre
              <br />
              a la vista.
            </h1>
            <p className="mt-6 max-w-sm text-background/60">
              Seguí el avance en tiempo real, revisá entregables y aprobá cambios directamente desde acá.
            </p>
          </div>

          <p className="relative font-mono text-xs text-background/40">
            {brandingResolved && branding?.brandName != null ? branding.brandName : 'portal.nous.com'}
          </p>
        </div>

        {/* Panel de formulario — SignIn de Clerk */}
        <div className="flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-full max-w-sm">
            {/*
             * Encabezado de marca en mobile / por encima del form.
             * En desktop lo ocupa el panel izquierdo; en mobile mostramos
             * logo + nombre del cliente (o el genérico NOUS) aquí.
             */}
            <div className="mb-4 flex items-center gap-2 lg:hidden">
              {branding?.logoUrl != null && brandingResolved ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt={branding.brandName ?? 'Logo del cliente'}
                  className="h-7 w-auto object-contain"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded bg-signal font-display text-sm font-bold text-signal-foreground">
                  N
                </span>
              )}
              <span className="eyebrow">
                {brandingResolved && branding?.brandName != null
                  ? branding.brandName
                  : 'NOUS'}
              </span>
            </div>

            <p className="eyebrow mb-1">Portal de clientes</p>
            <p className="text-sm text-muted-foreground mb-6">
              Accedé al seguimiento de tu proyecto. Si es tu primer ingreso, usá
              &ldquo;¿Olvidaste tu contraseña?&rdquo; para crear tu clave.
            </p>
          </div>

          {/*
           * routing="hash": compatible con cualquier path sin necesidad de
           * crear rutas /portal/login/sso-callback etc.
           * forceRedirectUrl: a dónde va el usuario tras autenticarse.
           * signUpUrl omitido: los clientes se provisionan por el admin.
           *
           * Estrategia de theming sin bloqueo:
           * El <SignIn> se monta inmediatamente con el appearance disponible
           * (genérico mientras no resolvió, branded cuando llegó el fetch).
           * Si el branding llega después del mount inicial, React re-renderiza
           * con el nuevo appearance — Clerk lo acepta como prop reactivo.
           */}
          <SignIn
            routing="hash"
            forceRedirectUrl="/portal"
            appearance={appearance}
          />
        </div>
      </div>
    </>
  )
}
