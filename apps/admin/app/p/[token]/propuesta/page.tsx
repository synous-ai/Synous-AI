import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProposalLanding } from '@/components/proposal/proposal-landing'
import { resolveProposal } from '@/app/portal/propuesta/resolve-proposal'
import { fetchPublicProposal, proposalMetadata } from '../proposal-metadata'

export function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  return proposalMetadata(params.token)
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
export default async function PublicProposalPage({ params }: { params: { token: string } }) {
  const data = await fetchPublicProposal(params.token)
  if (!data) notFound()

  return <ProposalLanding proposal={resolveProposal()} />
}
