import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, type DB } from '../db'
import { changeRequest, clientDealAccess, company, contact, deal, documentFolder, hubUser } from '../db/schema'
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

export interface ActiveClientDeal {
  id: string
  portalId: string
}

/**
 * Resuelve el deal ACTIVO (no archivado) del cliente autenticado, vía
 * `client_deal_access`. Si el cliente tiene varios deals (poco común hoy),
 * toma el más reciente — es el proyecto que está por arrancar.
 *
 * Devuelve `null` en vez de lanzar: a diferencia de un endpoint del wizard de
 * onboarding (donde no tener deal activo SÍ es un error de negocio), un
 * caller como `notifyBrandChange` (branding.service.ts) solo necesita "no hay
 * a quién notificar" sin que eso rompa la operación que lo llama.
 *
 * `resolveActiveDeal` en onboarding.service.ts reusa esta consulta (delega y
 * agrega el `throw`). `resolveActiveClientDeal` en client.service.ts NO la
 * reusa todavía — sigue con su propia query porque necesita más columnas
 * (`name`, `pipelineId`, `stageId`) que esta proyección no trae; unificarlas
 * pediría una query extra ahí. Queda pendiente si en algún momento conviene
 * ese trade-off.
 */
export async function resolveActiveClientDeal(clientId: string, executor: Executor = db): Promise<ActiveClientDeal | null> {
  const [row] = await executor
    .select({ id: deal.id, portalId: deal.portalId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, clientId), eq(deal.archived, false)))
    .orderBy(desc(deal.createdAt))
    .limit(1)
  return row ?? null
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

/**
 * Verifica que `folderId` (si viene) sea una carpeta VIVA del mismo `dealId` y
 * `portalId` del caller. `null`/`undefined` pasan: un documento en la raíz no
 * tiene carpeta, y desvincularlo es legítimo.
 *
 * La FK compuesta `document(folder_id, deal_id)` de la base ya impide que un
 * documento cuelgue de una carpeta de OTRO deal — pero con MATCH SIMPLE
 * (default de Postgres) esa FK no se evalúa si `deal_id` es NULL (documentos
 * sin deal, p. ej. adjuntos de un CR), así que sin este guard un folder_id de
 * otro portal/deal podía colarse igual en esa combinación. Este guard además
 * da un 400 legible en vez de que la FK reviente con un 500 de constraint.
 *
 * `FOR SHARE` dentro de la tx: evita que la carpeta se archive a mitad de
 * camino entre este chequeo y el INSERT/UPDATE del documento que lo usa.
 */
export async function assertFolderInDeal(
  portalId: string,
  dealId: string,
  folderId: string | null | undefined,
  executor: Executor = db,
): Promise<void> {
  if (!folderId) return
  const [row] = await executor
    .select({ id: documentFolder.id })
    .from(documentFolder)
    .where(
      and(
        eq(documentFolder.id, folderId),
        eq(documentFolder.dealId, dealId),
        eq(documentFolder.portalId, portalId),
        eq(documentFolder.archived, false),
      ),
    )
    .limit(1)
    .for('share')
  if (!row) throw Errors.badRequest('Carpeta inexistente')
}

/**
 * Verifica que `changeRequestId` (si viene) sea una CR del portal del caller y
 * —cuando se pasa `dealId`— del MISMO proyecto que la entidad que se vincula.
 *
 * Lo usan `invoice` y `deliverable`, que guardan el vínculo con la CR que los
 * origina: sin el guard, un usuario del portal A podía colgar su factura de una
 * change request del portal B y leerla después desde el detalle.
 *
 * El `dealId` NO es un extra cosmético: dentro de UN portal conviven los deals
 * de todos los clientes, y el detalle de la CR se lee también desde el portal
 * del cliente. Vincular por error la factura del deal de la Empresa B a una CR
 * del deal de la Empresa A no rompe ningún tenant, pero le muestra a A los
 * números de B. `dealId` ausente = solo chequeo de portal (una factura sin
 * proyecto asociado es legítima y no hay contra qué comparar).
 */
export async function assertChangeRequestInPortal(
  portalId: string,
  changeRequestId: string | null | undefined,
  executor: Executor = db,
  dealId?: string | null,
): Promise<void> {
  if (!changeRequestId) return
  const [row] = await executor
    .select({ id: changeRequest.id })
    .from(changeRequest)
    .where(
      and(
        eq(changeRequest.id, changeRequestId),
        eq(changeRequest.portalId, portalId),
        dealId ? eq(changeRequest.dealId, dealId) : undefined,
      ),
    )
    .limit(1)
  if (!row) throw Errors.badRequest('Change request inexistente')
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
