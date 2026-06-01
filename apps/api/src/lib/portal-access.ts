import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { clientDealAccess, deal } from '../db/schema'
import { Errors } from './errors'

/**
 * Devuelve los IDs de los deals a los que el cliente tiene acceso
 * según la tabla client_deal_access.
 */
export async function clientDealIds(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ dealId: clientDealAccess.dealId })
    .from(clientDealAccess)
    .where(eq(clientDealAccess.clientId, clientId))
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
