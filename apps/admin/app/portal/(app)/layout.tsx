import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { API_URL } from '@synous/shared'
import { PortalAppShell } from '@portal/components/portal/portal-app-shell'

/*
 * Layout de la parte autenticada del portal. Es de servidor solo para poder
 * exportar `generateMetadata`; todo el shell (guard de Clerk, header, sidebar,
 * gate del onboarding) vive en PortalAppShell, que es cliente.
 *
 * La marca va acá y no en app/portal/layout.tsx: aquel también envuelve las
 * páginas públicas (login, propuesta, bienvenida), que perderían el render
 * estático por `cookies()` y esperarían un fetch que no usan.
 */

const PORTAL_TITLE = 'Synous — Portal de Clientes'

/**
 * Nombre de marca del tenant, para el título de la pestaña. Mismo camino que el
 * login (cookie `dd_tenant` → GET /api/public/branding/:slug), pero del lado
 * servidor: el título llega bien desde el primer render. En la primera visita
 * la cookie todavía no viajó en la request, pero Next 14.2 mezcla en
 * `cookies()` las que setea el middleware (`x-middleware-set-cookie`).
 *
 * Best-effort: sin cookie, sin marca cargada, con la API caída o lenta, el
 * título queda el genérico. El timeout evita que una API colgada demore el
 * render del portal.
 */
async function tenantBrandName(): Promise<string | null> {
  const slug = cookies().get('dd_tenant')?.value
  if (!slug) return null
  try {
    const res = await fetch(`${API_URL}/api/public/branding/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: { brandName: string | null } | null }
    return json.data?.brandName?.trim() || null
  } catch {
    return null
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await tenantBrandName()
  return { title: brandName ? `${PORTAL_TITLE} ${brandName}` : PORTAL_TITLE }
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalAppShell>{children}</PortalAppShell>
}
