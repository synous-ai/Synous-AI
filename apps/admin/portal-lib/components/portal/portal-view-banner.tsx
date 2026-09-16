'use client'

import type { CSSProperties } from 'react'
import { ArrowLeft, Eye } from 'lucide-react'
import { usePortalViewer } from '@portal/lib/hooks'

/** Ficha de la empresa en el panel, en su host (`admin.<raíz>`). */
function panelCompanyHref(companyId: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  return root ? `https://admin.${root}/companies/${companyId}` : `/admin/companies/${companyId}`
}

/**
 * Cinta de obra al pie de la barra: rayas diagonales en `--signal`, el dorado
 * que el portal reserva para "requiere tu atención". Va inline porque un
 * gradiente repetido con espacios no entra limpio como clase arbitraria.
 */
const HAZARD_TAPE = {
  backgroundImage:
    'repeating-linear-gradient(135deg, hsl(var(--signal)) 0 8px, transparent 8px 16px)',
} satisfies CSSProperties

/**
 * Aviso fijo cuando un integrante del equipo está viendo el portal de un
 * cliente. La vista es de solo lectura: el API rechaza cualquier cambio.
 *
 * Es una barra de MODO, no un aviso de contenido: va en tinta (`--foreground`)
 * sobre el portal claro para que se lea como algo ajeno a lo que ve el cliente,
 * y no se confunda con una alerta propia de la página.
 */
export function PortalViewBanner() {
  const { viewer } = usePortalViewer()

  if (!viewer) return null

  return (
    <div role="status" className="relative bg-foreground text-background">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-signal/50 bg-signal/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-signal">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
            </span>
            Modo vista
          </span>

          <p className="flex min-w-0 items-center gap-2 text-sm">
            <Eye className="hidden h-4 w-4 shrink-0 text-background/60 sm:block" aria-hidden />
            <span className="hidden truncate sm:inline">
              Estás viendo el portal de <span className="font-semibold">{viewer.companySlug}</span> como admin
            </span>
            <span className="hidden text-background/40 md:inline" aria-hidden>
              ·
            </span>
            <span className="hidden text-background/60 md:inline">Solo lectura</span>
          </p>
        </div>

        <a
          href={panelCompanyHref(viewer.companyId)}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-background/20 px-3 py-1 text-sm font-medium transition-colors hover:border-background/40 hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
        >
          <ArrowLeft
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
          Volver al panel
        </a>
      </div>

      <div aria-hidden className="h-[3px] opacity-80" style={HAZARD_TAPE} />
    </div>
  )
}
