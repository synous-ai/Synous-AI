import { notFound } from 'next/navigation'
import { RenderProposal } from '@/components/proposal/render-proposal'
import { isProposalTemplate } from '@/components/proposal/proposal-templates'

/**
 * Vista previa INTERNA de una plantilla, antes de aprobar la propuesta.
 *
 * Vive bajo /admin a propósito: el middleware exige sesión del equipo, así que
 * el copy y los precios de un cliente no quedan en una URL pública y
 * adivinable (a diferencia de `/portal/propuesta`, que es la plantilla clásica).
 * Tampoco pasa por la API: no marca nada como visto ni avisa a nadie, y los
 * CTAs no envían (no hay token).
 */
export default function ProposalPreviewPage({ params }: { params: { template: string } }) {
  if (!isProposalTemplate(params.template)) notFound()
  return <RenderProposal template={params.template} token={null} />
}
