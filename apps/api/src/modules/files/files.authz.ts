import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  document,
  changeRequest,
  changeRequestAttachment,
  clientAsset,
  libraryItem,
  expense,
  company,
  clientAccount,
  fileUpload,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { clientDealIds } from '../../lib/portal-access'
import { isReadableStorageKey, isStorageKey, type FilePurpose } from '../../lib/storage'
import { FINANCE_ROLES } from '../finance/finance.schema'

/**
 * Quién pide el archivo. Lo arma `authenticateAny` (files.router.ts) a partir
 * de la sesión de Clerk ya verificada — acá solo se decide el QUÉ puede leer.
 * El rol del hub viaja porque hay archivos con la misma restricción de rol que
 * su módulo (comprobantes de gastos → finanzas).
 */
export type FileActor =
  | { kind: 'hub'; userId: string; portalId: string; role: string }
  | { kind: 'client'; clientId: string; portalId: string }

function deny(): never {
  throw Errors.forbidden('No autorizado a leer este archivo')
}

/** Logos: se reclaman con su propósito y son públicos por naturaleza. */
const LOGO_PURPOSES: readonly string[] = ['brand_logo', 'proposal_logo'] satisfies FilePurpose[]

/**
 * Autorización por recurso para `POST /api/files/access`.
 *
 * Resuelve de qué fila es dueño el storageKey y aplica la regla de negocio de
 * ESA tabla. Lanza `Errors.forbidden` si el actor no puede leerlo.
 *
 * Todas las búsquedas filtran por el portal del ACTOR. Antes buscaban la key
 * en todo el sistema: un usuario del portal A que colgaba de un registro propio
 * la key de un archivo del portal B heredaba el acceso ("referencia plantada").
 * Por lo mismo, si la key tiene fila en `file_upload` de OTRO portal, se niega
 * sin mirar nada más.
 *
 * Reglas:
 *  - `document`             → hub: mismo portal. Cliente: deal propio Y visible_to_client.
 *  - `change_request_attachment` → misma regla que document pero vía change_request.
 *  - `client_asset`         → hub: mismo portal. Cliente: dueño del asset O deal propio.
 *  - `library_item`         → hub: mismo portal. Cliente: SIEMPRE denegado (material interno).
 *  - `expense`              → hub del mismo portal CON rol de finanzas (owner|member, igual que
 *    finance.router). Cliente: SIEMPRE denegado (comprobantes del negocio).
 *  - `company.brand_logo_key` / `client_account.brand_logo_key` → hub y cliente del mismo portal.
 *  - Logo ya reclamado (`brand_logo` / `proposal_logo` attached) → hub del portal
 *    (previsualizar el logo de una propuesta que subió un compañero); el cliente
 *    solo el de marca.
 *  - Key huérfana (sin referencia) → SOLO quien la subió, según el ledger: es la
 *    ventana entre subir y guardar el registro. Sin fila en el ledger → denegado.
 */
export async function assertCanReadFile(actor: FileActor, storageKey: string): Promise<void> {
  if (!isReadableStorageKey(storageKey)) deny()
  const portalId = actor.portalId

  const [ledgerRows, documentRows, attachmentRows, assetRows, libraryRows, expenseRows, companyRows, clientAccountRows] =
    await Promise.all([
      db
        .select({
          portalId: fileUpload.portalId,
          purpose: fileUpload.purpose,
          status: fileUpload.status,
          uploadedByUserId: fileUpload.uploadedByUserId,
          uploadedByClientId: fileUpload.uploadedByClientId,
        })
        .from(fileUpload)
        .where(eq(fileUpload.storageKey, storageKey))
        .limit(1),
      db
        .select({ dealId: document.dealId, visibleToClient: document.visibleToClient, archived: document.archived })
        .from(document)
        .where(and(eq(document.storageKey, storageKey), eq(document.portalId, portalId)))
        .limit(1),
      db
        .select({ dealId: changeRequest.dealId })
        .from(changeRequestAttachment)
        .innerJoin(changeRequest, eq(changeRequest.id, changeRequestAttachment.changeRequestId))
        .where(and(eq(changeRequestAttachment.storageKey, storageKey), eq(changeRequest.portalId, portalId)))
        .limit(1),
      db
        .select({ dealId: clientAsset.dealId, clientId: clientAsset.clientId })
        .from(clientAsset)
        .where(and(eq(clientAsset.storageKey, storageKey), eq(clientAsset.portalId, portalId)))
        .limit(1),
      db
        .select({ id: libraryItem.id })
        .from(libraryItem)
        .where(and(eq(libraryItem.storageKey, storageKey), eq(libraryItem.portalId, portalId)))
        .limit(1),
      db
        .select({ id: expense.id })
        .from(expense)
        .where(and(eq(expense.storageKey, storageKey), eq(expense.portalId, portalId)))
        .limit(1),
      db
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.brandLogoKey, storageKey), eq(company.portalId, portalId)))
        .limit(1),
      db
        .select({ id: clientAccount.id })
        .from(clientAccount)
        .where(and(eq(clientAccount.brandLogoKey, storageKey), eq(clientAccount.portalId, portalId)))
        .limit(1),
    ])

  const ledger = ledgerRows[0]
  if (ledger && ledger.portalId !== portalId) deny()

  const doc = documentRows[0]
  if (doc) {
    if (actor.kind === 'hub') return
    if (!doc.archived && doc.dealId && doc.visibleToClient && (await clientDealIds(actor.clientId)).includes(doc.dealId)) return
    deny()
  }

  const attachment = attachmentRows[0]
  if (attachment) {
    if (actor.kind === 'hub') return
    if ((await clientDealIds(actor.clientId)).includes(attachment.dealId)) return
    deny()
  }

  const asset = assetRows[0]
  if (asset) {
    if (actor.kind === 'hub') return
    if (asset.clientId === actor.clientId) return
    if ((await clientDealIds(actor.clientId)).includes(asset.dealId)) return
    deny()
  }

  // Material interno: el cliente nunca lo lee.
  if (libraryRows[0]) {
    if (actor.kind === 'hub') return
    deny()
  }

  // Comprobantes del negocio: solo quien puede ver finanzas. Un viewer o un
  // collaborator no llega a GET /api/finance/expenses; tampoco al archivo.
  if (expenseRows[0]) {
    if (actor.kind === 'hub' && (FINANCE_ROLES as readonly string[]).includes(actor.role)) return
    deny()
  }

  if (companyRows[0] || clientAccountRows[0]) return

  if (!ledger) deny()

  if (ledger.status === 'attached' && LOGO_PURPOSES.includes(ledger.purpose)) {
    if (actor.kind === 'hub' || ledger.purpose === 'brand_logo') return
  }

  const isUploader =
    actor.kind === 'hub' ? ledger.uploadedByUserId === actor.userId : ledger.uploadedByClientId === actor.clientId
  if (isUploader) return
  deny()
}

// ─── Logos públicos ──────────────────────────────────────────────────────────

/**
 * Portal del registro VIGENTE que usa la key como logo de marca, o null. Una
 * empresa archivada o una cuenta desactivada ya no publica su logo.
 */
export async function findBrandLogoPortal(storageKey: string): Promise<string | null> {
  const [companyRow] = await db
    .select({ portalId: company.portalId })
    .from(company)
    .where(and(eq(company.brandLogoKey, storageKey), eq(company.archived, false)))
    .limit(1)
  if (companyRow) return companyRow.portalId
  const [accountRow] = await db
    .select({ portalId: clientAccount.portalId })
    .from(clientAccount)
    .where(and(eq(clientAccount.brandLogoKey, storageKey), eq(clientAccount.isActive, true)))
    .limit(1)
  return accountRow?.portalId ?? null
}

/**
 * ¿Se puede servir la key SIN sesión como logo del portal `ownerPortalId`?
 *
 * Key nueva: solo si el ledger la registra en ese portal, con ese propósito y
 * ya reclamada. Key legacy (sin ledger): solo si no es el archivo de un
 * registro privado. Sin esto, un logo configurado con la key de un contrato o
 * un comprobante lo publicaba en internet.
 */
export async function isServablePublicLogo(
  storageKey: string,
  ownerPortalId: string,
  purpose: 'brand_logo' | 'proposal_logo',
): Promise<boolean> {
  if (!isReadableStorageKey(storageKey)) return false
  const [ledger] = await db
    .select({ portalId: fileUpload.portalId, purpose: fileUpload.purpose, status: fileUpload.status })
    .from(fileUpload)
    .where(eq(fileUpload.storageKey, storageKey))
    .limit(1)

  if (isStorageKey(storageKey)) {
    return Boolean(ledger && ledger.portalId === ownerPortalId && ledger.purpose === purpose && ledger.status === 'attached')
  }
  if (ledger) return false

  const privateReferences = await Promise.all([
    db.select({ id: document.id }).from(document).where(eq(document.storageKey, storageKey)).limit(1),
    db.select({ id: changeRequestAttachment.id }).from(changeRequestAttachment).where(eq(changeRequestAttachment.storageKey, storageKey)).limit(1),
    db.select({ id: clientAsset.id }).from(clientAsset).where(eq(clientAsset.storageKey, storageKey)).limit(1),
    db.select({ id: libraryItem.id }).from(libraryItem).where(eq(libraryItem.storageKey, storageKey)).limit(1),
    db.select({ id: expense.id }).from(expense).where(eq(expense.storageKey, storageKey)).limit(1),
  ])
  return privateReferences.every((rows) => rows.length === 0)
}
