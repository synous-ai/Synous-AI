import { API_URL } from '@/lib/config'
import { templateOf } from '@/components/proposal/proposal-templates'
import { scopePdfResponse } from '@/lib/proposal-scope-pdf'

export const dynamic = 'force-dynamic'

/**
 * Descarga del documento de alcance desde el link público de la propuesta.
 *
 * El token es la credencial, igual que en la landing: se valida contra
 * `/template` (404 si no existe o es un borrador, y no la marca como vista).
 */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  let template: unknown
  try {
    const res = await fetch(`${API_URL}/api/public/proposals/${encodeURIComponent(params.token)}/template`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 404) return new Response('Not found', { status: 404 })
    if (!res.ok) return new Response('No disponible', { status: 502 })
    const json = (await res.json()) as { data?: { template?: string } }
    template = json.data?.template
  } catch {
    return new Response('No disponible', { status: 502 })
  }

  return scopePdfResponse(templateOf(template))
}
