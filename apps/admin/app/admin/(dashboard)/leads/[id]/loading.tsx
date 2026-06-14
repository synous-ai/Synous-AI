'use client'

import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton del detalle. Es client component SOLO para loguear el timing de
 * navegación (ver [NAV DEBUG]); su sola existencia hace que la navegación se
 * commitee al instante (la URL cambia y el sidebar se marca) mostrando esto
 * mientras carga el segmento.
 */
export default function LeadDetailLoading() {
  useEffect(() => {
    const t0 = (window as Window & { __navT0?: number }).__navT0
    // eslint-disable-next-line no-console
    console.warn(
      `[NAV DEBUG] ⏳ loading.tsx (skeleton) MOSTRADO — la ruta YA se commiteó (sidebar marcado)${
        t0 ? ` → +${Math.round(performance.now() - t0)}ms desde el click` : ''
      }`,
    )
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6 lg:flex-row">
      <Skeleton className="h-96 w-full rounded-2xl lg:w-80 lg:flex-shrink-0" />
      <Skeleton className="h-96 min-w-0 flex-1 rounded-2xl" />
    </div>
  )
}
