import { ProposalDeck } from '@/components/proposals/proposal-deck'

export const metadata = {
  title: 'Propuesta — NOUS',
  description: 'Tu propuesta a medida.',
}

/**
 * Vista PÚBLICA de una propuesta (link `/p/<token>`). Vive en el apex (fuera de
 * /admin y /portal), sin auth: el token es la credencial. Renderiza el deck de
 * slides estilo presentación.
 */
export default function PublicProposalPage({ params }: { params: { token: string } }) {
  return <ProposalDeck token={params.token} />
}
