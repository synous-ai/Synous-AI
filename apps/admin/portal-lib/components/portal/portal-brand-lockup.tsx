'use client'

/**
 * Marca del header del portal: logotipo de Synous + logo de la marca del cliente.
 *
 * `logotipo-ink.svg` y no `logotipo.svg`: el segundo tiene las letras en blanco
 * (es para fondos oscuros) y el shell del portal es claro por diseño — ver
 * portal-theme.css. Es el mismo dibujo que usa /portal/login sobre fondo claro.
 *
 * El logo del cliente sale de `useBranding()`: GET /api/client/branding devuelve
 * la ruta PÚBLICA del logo, que sirve en un `<img>` sin token. Sin logo, o si no
 * carga, se muestra el nombre de la marca; sin ninguno de los dos, solo el
 * logotipo de Synous.
 */

import { useEffect, useState } from 'react'
import { useBranding } from '@portal/components/branding/branding-provider'

export function PortalBrandLockup() {
  const { brand } = useBranding()
  const logoUrl = brand?.logoUrl ?? null
  const brandName = brand?.brandName?.trim() || null
  const [logoFailed, setLogoFailed] = useState(false)

  // Un logo nuevo (el cliente lo reemplaza desde Marca) merece otro intento.
  useEffect(() => setLogoFailed(false), [logoUrl])

  const showLogo = Boolean(logoUrl) && !logoFailed

  return (
    <span className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logotipo-ink.svg" alt="Synous AI" className="h-5 w-auto shrink-0" />
      {(showLogo || brandName) && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl!}
              alt={brandName ?? 'Logo de tu marca'}
              onError={() => setLogoFailed(true)}
              className="h-7 w-auto max-w-[120px] object-contain sm:max-w-[160px]"
            />
          ) : (
            <span className="truncate font-editorial text-lg tracking-wide text-muted-foreground">{brandName}</span>
          )}
        </>
      )}
    </span>
  )
}
