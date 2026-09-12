import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { clientDealAccess, deal } from '../db/schema'
import { Errors } from './errors'

/**
 * Devuelve los IDs de los deals ACTIVOS a los que el cliente tiene acceso
 * según la tabla client_deal_access.
 *
 * El join contra `deal` con `archived = false` no es cosmético: archivar es el
 * mecanismo de borrado del CRM (nunca se borran filas). Sin este filtro, un
 * deal archivado desaparecía de GET /api/client/deals pero el cliente seguía
 * pudiendo listar y ACTUAR sobre sus entregables, facturas, formularios y
 * change requests — porque todos esos endpoints se apoyan en este helper.
 *
 * Mismo criterio que `resolveActiveClientDeal` (client.service.ts) y
 * `resolveActiveDeal` (onboarding.service.ts), que ya filtraban bien.
 */
export async function clientDealIds(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ dealId: clientDealAccess.dealId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, clientId), eq(deal.archived, false)))
  return rows.map((r) => r.dealId)
}

/**
 * Verifica que el deal exista, pertenezca al portal y no esté archivado.
 * Lanza Errors.badRequest('Deal inexistente') si no cumple.
 * Usada tanto por admin (cr.service) como por portal (deliverables.service).
 */
export async function assertDealInPortal(
  portalId: string,
  dealId: string,
): Promise<typeof deal.$inferSelect> {
  const [d] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .limit(1)
  if (!d) throw Errors.badRequest('Deal inexistente')
  return d
}
