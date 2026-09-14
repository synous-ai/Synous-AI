'use client'

/**
 * Índice del portal. No pinta nada: manda al Inicio.
 *
 * Existe porque el portal tiene dos puertas de entrada — `/portal` (ruta
 * física) y `/` en un host de tenant, que el middleware reescribe a `/portal`.
 * Las dos tienen que terminar en la misma pantalla, y con una URL canónica:
 * si el índice renderizara el dashboard, habría dos URLs sirviendo lo mismo.
 *
 * `portalHref` resuelve el destino con el prefijo correcto en cada caso.
 */

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { portalHref } from '@portal/components/portal/portal-nav'

export default function PortalIndexPage() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    router.replace(portalHref(pathname, 'dashboard'))
  }, [router, pathname])

  return null
}
