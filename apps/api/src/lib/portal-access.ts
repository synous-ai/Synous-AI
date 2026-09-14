import { and, eq, inArray } from 'drizzle-orm'
import { db, type DB } from '../db'
import { clientDealAccess, company, contact, deal, hubUser } from '../db/schema'
import type { Tx } from './audit'
import { Errors } from './errors'

/**
 * Conexión sobre la que corre la verificación. Dentro de una transacción hay
 * que pasar el `tx`: consultar con el `db` global pide una segunda conexión al
 * pool mientras la transacción retiene la suya (con pools chicos, deadlock).
 */
type Executor = DB | Tx

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
  executor: Executor = db,
): Promise<typeof deal.$inferSelect> {
  const [d] = await executor
    .select()
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .limit(1)
  if (!d) throw Errors.badRequest('Deal inexistente')
  return d
}

/*
 * Verificación de claves foráneas que llegan en el body.
 *
 * Todo id que el cliente HTTP manda para relacionar entidades (companyId,
 * primaryContactId, ownerId...) tiene que pertenecer al portal del que llama.
 * Postgres solo garantiza que la fila exista, no que sea del mismo tenant: sin
 * esto, un usuario del portal A podía colgar de su deal una empresa del portal
 * B y después leerla completa desde el detalle del deal.
 *
 * `null`/`undefined` pasan: omitir o desvincular la relación es legítimo.
 */

export async function assertCompanyInPortal(
  portalId: string,
  companyId: string | null | undefined,
  executor: Executor = db,
): Promise<void> {
  if (!companyId) return
  const [row] = await executor
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.id, companyId), eq(company.portalId, portalId)))
    .limit(1)
  if (!row) throw Errors.badRequest('Empresa inexistente')
}

export async function assertContactInPortal(
  portalId: string,
  contactId: string | null | undefined,
  executor: Executor = db,
): Promise<void> {
  if (!contactId) return
  const [row] = await executor
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.portalId, portalId)))
    .limit(1)
  if (!row) throw Errors.badRequest('Contacto inexistente')
}

export async function assertHubUsersInPortal(
  portalId: string,
  userIds: readonly (string | null | undefined)[],
  executor: Executor = db,
): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return
  const rows = await executor
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), inArray(hubUser.id, ids)))
  if (rows.length !== ids.length) throw Errors.badRequest('Usuario inexistente')
}
