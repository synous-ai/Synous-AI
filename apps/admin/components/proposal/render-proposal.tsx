import { ProposalLanding } from '@/components/proposal/proposal-landing'
import { resolveProposal } from '@/app/portal/propuesta/resolve-proposal'
import { ProductVisionLanding } from './product-vision/product-vision-landing'
import { katherineLindoProposal } from './product-vision/katherine-lindo-content'
import type { ProposalTemplate } from './proposal-templates'

/**
 * La landing completa de una plantilla. `token` es el del link público; `null`
 * en la vista previa interna del admin.
 */
export function RenderProposal({ template, token }: { template: ProposalTemplate; token: string | null }) {
  switch (template) {
    case 'katherine-lindo':
      return <ProductVisionLanding content={katherineLindoProposal} token={token} />
    case 'classic':
      return <ProposalLanding proposal={resolveProposal()} />
  }
}
