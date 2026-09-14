'use client'

import { Eye } from 'lucide-react'
import { usePortalViewer } from '@portal/lib/hooks'

/** Ficha de la empresa en el panel, en su host (`admin.<raíz>`). */
function panelCompanyHref(companyId: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  return root ? `https://admin.${root}/companies/${companyId}` : `/admin/companies/${companyId}`
}

/**
 * Aviso fijo cuando un integrante del equipo está viendo el portal de un
 * cliente. La vista es de solo lectura: el API rechaza cualquier cambio.
 */
export function PortalViewBanner() {
  const { viewer } = usePortalViewer()

  if (!viewer) return null

  return (
    <div role="status" className="border-b border-signal/40 bg-signal/15 px-4 py-2 text-sm text-foreground sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Eye className="h-4 w-4 text-signal" aria-hidden />
          Estás viendo el portal como admin · solo lectura
        </span>
        <a href={panelCompanyHref(viewer.companyId)} className="font-medium underline underline-offset-4">
          Volver al panel
        </a>
      </div>
    </div>
  )
}
