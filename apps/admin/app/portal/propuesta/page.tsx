import { ProposalLanding } from '@/components/proposal/proposal-landing'
import { resolveProposal } from './resolve-proposal'

/**
 * Preview interno de la plantilla, sin datos de ningún cliente: `resolveProposal`
 * sin contenido devuelve la plantilla tal cual.
 *
 * La propuesta real de un cliente se sirve por su link público `/p/<token>`.
 */
export default function ProposalTemplatePreview() {
  return <ProposalLanding proposal={resolveProposal()} />
}
