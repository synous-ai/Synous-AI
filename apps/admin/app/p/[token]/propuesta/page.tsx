import { notFound } from 'next/navigation'
import { API_URL } from '@/lib/config'
import { ProposalLanding } from '@/components/proposal/proposal-landing'
import { resolveProposal } from '@/app/portal/propuesta/resolve-proposal'
import type { PublicProposal } from '@/lib/types/proposals'

export const metadata = {
  title: 'Propuesta — Synous',
  description: 'Tu propuesta a medida.',
  robots: { index: false, follow: false },
}

/** El contenido depende del token y cambia hasta que se envía: nunca se cachea. */
export const dynamic = 'force-dynamic'

/**
 * Vista PÚBLICA de una propuesta (`/p/<token>`). Vive en el apex, fuera de
 * /admin y /portal, y sin auth: el token es la credencial.
 *
 * Se renderiza en el server para que el cliente reciba la propuesta ya armada,
 * sin pantalla de carga. El backend devuelve 404 tanto si el token no existe
 * como si la propuesta sigue en borrador, así un link filtrado antes de tiempo
 * no revela que exista.
 */
async function fetchProposal(token: string): Promise<PublicProposal | null> {
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
}

export default async function PublicProposalPage({ params }: { params: { token: string } }) {
  const data = await fetchProposal(params.token)
  if (!data) notFound()

  return <ProposalLanding proposal={resolveProposal(data.content)} />
}
