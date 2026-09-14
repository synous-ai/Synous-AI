'use client'

import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { apiGet } from '@portal/lib/api'

interface ClientMe {
  id: string
  viewer: { companyId: string; companySlug: string } | null
}

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
  const { data } = useQuery({
    queryKey: ['client-auth', 'me'],
    queryFn: () => apiGet<ClientMe>('/api/client-auth/me'),
    staleTime: Infinity,
  })

  if (!data?.viewer) return null

  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Eye className="h-4 w-4" aria-hidden />
          Estás viendo el portal como admin · solo lectura
        </span>
        <a href={panelCompanyHref(data.viewer.companyId)} className="font-medium underline underline-offset-4">
          Volver al panel
        </a>
      </div>
    </div>
  )
}
