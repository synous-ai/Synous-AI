import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PROPOSAL_TEMPLATES, type ProposalTemplate } from '@/components/proposal/proposal-templates'

/**
 * El documento de alcance (PDF) de una plantilla, listo para descargar.
 *
 * Los PDFs viven en `apps/admin/assets/proposals/` y NO en `public/`: así solo
 * se bajan por una ruta que valida el acceso (el token de la propuesta, o la
 * sesión del admin en la vista previa). `next.config.mjs` los suma al bundle de
 * esas rutas con `outputFileTracingIncludes`; sin eso, en Vercel no existen.
 */
export async function scopePdfResponse(template: ProposalTemplate): Promise<Response> {
  const scope = PROPOSAL_TEMPLATES[template].scopePdf
  if (!scope) return new Response('Not found', { status: 404 })

  let bytes: Buffer
  try {
    bytes = await readFile(path.join(process.cwd(), 'assets', 'proposals', scope.file))
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const asciiName = scope.downloadName.normalize('NFD').replace(/[^\x20-\x7e]/g, '')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(scope.downloadName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
