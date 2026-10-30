import { isProposalTemplate } from '@/components/proposal/proposal-templates'
import { scopePdfResponse } from '@/lib/proposal-scope-pdf'

export const dynamic = 'force-dynamic'

/**
 * Descarga del documento de alcance desde la vista previa interna. Vive bajo
 * `/admin/*`, así que el middleware ya exige la sesión del equipo.
 */
export async function GET(_request: Request, { params }: { params: { template: string } }) {
  if (!isProposalTemplate(params.template)) return new Response('Not found', { status: 404 })
  return scopePdfResponse(params.template)
}
