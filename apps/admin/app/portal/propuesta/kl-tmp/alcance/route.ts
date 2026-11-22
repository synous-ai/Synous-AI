// TEMPORAL: prueba local de la descarga del alcance. Borrar.
import { scopePdfResponse } from '@/lib/proposal-scope-pdf'
export const dynamic = 'force-dynamic'
export function GET() {
  return scopePdfResponse('katherine-lindo')
}
