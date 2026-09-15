import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { API_URL } from '@synous/shared'
import { Providers } from '@portal/providers'
import { PortalScope } from '@portal/components/ui/portal-scope'
import './portal-theme.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-portal-sans',
  display: 'swap',
})

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
 * render de todo el portal.
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
  return {
    title: brandName ? `${PORTAL_TITLE} ${brandName}` : PORTAL_TITLE,
    description: 'Tu portal de seguimiento de proyectos con Synous',
  }
}

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalScope className={`portal-theme ${jakarta.variable}`}>
      <Providers>{children}</Providers>
    </PortalScope>
  )
}
