import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { cache } from 'react'
import { API_URL } from '@/lib/config'
import { proposal as template } from '@/app/portal/propuesta/proposal-content'
import type { PublicProposal } from '@/lib/types/proposals'

/**
 * La propuesta pública por token. `cache` la pide una sola vez por request
 * aunque la usen `generateMetadata` y la página.
 *
 * El backend responde 404 tanto para un token inexistente como para una
 * propuesta en borrador, así que un link compartido antes de tiempo no revela
 * nada: acá eso llega como `null`.
 */
export const fetchPublicProposal = cache(async (token: string): Promise<PublicProposal | null> => {
  try {
    const res = await fetch(`${API_URL}/api/public/proposals/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: PublicProposal }
    return json.data ?? null
  } catch {
    // La API caída no debe tirar una traza a la cara del cliente.
    return null
  }
})

/**
 * Base de las URLs absolutas de la vista previa (WhatsApp y compañía no
 * aceptan relativas). Manda el dominio raíz configurado, igual que el
 * middleware; los headers del request quedan sólo para local, donde no hay
 * dominio raíz.
 */
function requestOrigin(): URL | undefined {
  const root = process.env['NEXT_PUBLIC_ROOT_DOMAIN']
  if (root) return new URL(`https://${root.toLowerCase()}`)

  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return undefined
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return new URL(`${proto}://${host}`)
}

/**
 * Nombre y fecha que muestra el link: salen de la plantilla, igual que el resto
 * de los textos. Sin propuesta visible (token inválido o borrador) no hay nada.
 */
export async function proposalIdentity(token: string): Promise<{ client: string; date: string } | null> {
  const data = await fetchPublicProposal(token)
  if (!data) return null
  return { client: template.envelope.recipient, date: template.envelope.dateLabel }
}

/**
 * Título, descripción y vista previa del link de una propuesta: lo que se ve
 * en la pestaña y cuando el link se manda por WhatsApp, mail o Slack. Lleva el
 * nombre del cliente; sin propuesta visible, queda genérico.
 */
export async function proposalMetadata(token: string): Promise<Metadata> {
  const client = (await proposalIdentity(token))?.client

  const title = client ? `Propuesta ${client} | Synous` : 'Propuesta | Synous'
  const description = client
    ? `Propuesta a medida para ${client}: alcance, inversión y próximos pasos.`
    : 'Convertimos metodologías en productos y operaciones en sistemas.'
  const image = {
    url: `/p/${encodeURIComponent(token)}/og`,
    width: 1200,
    height: 630,
    alt: client ? `Propuesta para ${client}` : 'Propuesta de Synous',
  }

  return {
    metadataBase: requestOrigin(),
    title,
    description,
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: 'Synous',
      title,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  }
}
