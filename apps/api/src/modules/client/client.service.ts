import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import {
  deal,
  deliverable,
  document,
  documentFolder,
  invoice,
  payment,
  clientDealAccess,
  pipeline,
  pipelineStage,
  projectUpdate,
  recordHistory,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { assertFolderInDeal, clientDealIds } from '../../lib/portal-access'
import { writeAudit, recordFieldChanges } from '../../lib/audit'
import { claimUpload, prepareUploadClaim } from '../uploads/uploads.service'
import { getClientDocumentDTOById, type ClientDocumentDTO } from '../documents/documents.service'
import type { ClientCreateDocumentFolderDTO, ClientCreateDocumentDTO, ClientUpdateDocumentDTO } from '../documents/documents.schema'
import { PRODUCTION_PIPELINE_LABEL } from '../onboarding/assignees'
import { notifyAdmins } from '../notifications/notify'
import { isInvoiceOverdue } from '../finance/finance-shared'

type DeliverableRow = typeof deliverable.$inferSelect

/** Proyección del deal expuesta al cliente — NUNCA la fila completa (oculta ownerId/custom/pipelineId). */
export interface ClientDealDTO {
  id: string
  name: string
  amount: string | null
  currency: string
  stageId: string
  createdAt: Date
}

export interface ClientInvoiceDTO {
  id: string
  number: number
  total: string
  currency: string
  status: string
  issueDate: string | null
  dueDate: string | null
  balance: string
  /**
   * Derivado con la MISMA lógica de fecha que el admin (`isInvoiceOverdue` en
   * finance-shared.ts), no del `status` almacenado — ese solo cambia con una
   * transición manual del equipo (no hay cron). `status` se deja intacto para
   * no romper nada que ya dependa del valor crudo.
   */
  isOverdue: boolean
}

export async function clientDeals(clientId: string): Promise<ClientDealDTO[]> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db
    .select({ id: deal.id, name: deal.name, amount: deal.amount, currency: deal.currency, stageId: deal.stageId, createdAt: deal.createdAt })
    .from(deal)
    .where(and(inArray(deal.id, ids), eq(deal.archived, false)))
}

export async function clientDeliverables(clientId: string, query: ListQuery): Promise<Paginated<DeliverableRow>> {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return { items: [], nextCursor: null }
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(deliverable)
    .where(
      and(
        inArray(deliverable.dealId, ids),
        eq(deliverable.visibleToClient, true),
        eq(deliverable.archived, false),
        cursor ? cursorWhere(deliverable.createdAt, deliverable.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(deliverable.createdAt), desc(deliverable.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit)
}

async function assertClientDeliverable(
  clientId: string,
  deliverableId: string,
): Promise<DeliverableRow & { portalId: string }> {
  const ids = await clientDealIds(clientId)
  const [dv] = await db.select().from(deliverable).where(eq(deliverable.id, deliverableId)).limit(1)
  // El chequeo de visibilidad va acá y no solo en el listado: sin esto, un
  // cliente que conociera el id podría aprobar o rechazar un entregable interno
  // aunque nunca lo viera en su Portal. Se responde 404 (no 403) para no
  // confirmar que el entregable existe.
  if (!dv || !ids.includes(dv.dealId) || !dv.visibleToClient || dv.archived) {
    throw Errors.notFound('Entregable no encontrado')
  }
  // `deliverable` no guarda portalId: cuelga del deal. Se resuelve acá para que
  // los callers no tengan que repetir el lookup.
  const [d] = await db.select({ portalId: deal.portalId }).from(deal).where(eq(deal.id, dv.dealId)).limit(1)
  if (!d) throw Errors.notFound('Entregable no encontrado')
  return { ...dv, portalId: d.portalId }
}

export async function approveDeliverable(clientId: string, deliverableId: string): Promise<void> {
  const dv = await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'approved', reviewedBy: clientId, reviewedAt: new Date(), feedback: null })
    .where(eq(deliverable.id, deliverableId))

  // Después del UPDATE y sin await bloqueante sobre el resultado: notify nunca
  // lanza, así que la aprobación no puede fallar por un problema de avisos.
  await notifyAdmins(dv.portalId, 'deliverable_approved', { dealId: dv.dealId, deliverableTitle: dv.title }, {
    entity: { type: 'deliverable', id: deliverableId },
    dedupeKey: `deliverable_approved:${deliverableId}`,
  })
}

export async function requestChanges(clientId: string, deliverableId: string, feedback: string): Promise<void> {
  const dv = await assertClientDeliverable(clientId, deliverableId)
  await db
    .update(deliverable)
    .set({ status: 'changes_requested', reviewedBy: clientId, reviewedAt: new Date(), feedback })
    .where(eq(deliverable.id, deliverableId))

  // Sin dedupeKey a propósito: el cliente puede pedir cambios varias veces
  // sobre el mismo entregable (segunda vuelta de revisión) y cada pedido es un
  // evento nuevo que el equipo tiene que ver.
  await notifyAdmins(dv.portalId, 'deliverable_changes_requested', { dealId: dv.dealId, deliverableTitle: dv.title }, {
    entity: { type: 'deliverable', id: deliverableId },
  })
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listClientInvoices(clientId: string, query: ListQuery): Promise<Paginated<ClientInvoiceDTO>> {
  const dealIds = await clientDealIds(clientId)
  if (dealIds.length === 0) return { items: [], nextCursor: null }

  // Fetch invoices for the client's deals (non-archived)
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(invoice)
    .where(
      and(
        inArray(invoice.dealId, dealIds),
        eq(invoice.archived, false),
        cursor ? cursorWhere(invoice.createdAt, invoice.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(invoice.createdAt), desc(invoice.id))
    .limit(query.limit + 1)
  const { items: invoices, nextCursor } = paginateRows(rows, query.limit)

  if (invoices.length === 0) return { items: [], nextCursor }

  // Aggregate payments per invoice in a single query — no N+1. Se suma
  // `amountBase` (USD), NO `amount`: `invoice.currency` y `payment.currency`
  // son independientes (una factura ARS puede cobrarse con un pago USD), así
  // que sumar montos crudos mezclaba unidades distintas bajo el mismo total —
  // el mismo motivo por el que el admin (finance/invoices.ts) balancea todo
  // en amountBase.
  const invoiceIds = invoices.map((inv) => inv.id)
  const paymentTotals = await db
    .select({
      invoiceId: payment.invoiceId,
      paidBase: sql<string>`COALESCE(SUM(${payment.amountBase}), '0')`,
    })
    .from(payment)
    .where(inArray(payment.invoiceId, invoiceIds))
    .groupBy(payment.invoiceId)

  const paidBaseByInvoice = new Map<string, number>(
    paymentTotals.map((r) => [r.invoiceId, Number(r.paidBase)]),
  )

  const items = invoices.map((inv) => {
    const totalPaidBase = paidBaseByInvoice.get(inv.id) ?? 0
    // Balance real en USD (misma unidad que `amountBase`), usado para
    // `isOverdue` — currency-agnostic: solo importa si es > 0, no en qué
    // moneda está expresado.
    const balanceBase = Math.max(0, Number(inv.amountBase) - totalPaidBase)
    // El campo `balance` que ve el cliente se muestra en la MONEDA de la
    // factura (el front lo formatea con `formatCurrency(invoice.balance,
    // invoice.currency)` — mostrar un número en USD bajo un símbolo ARS, o
    // viceversa, sería incorrecto). `calcAmountBase` define
    // amountBase = amount / exchangeRate (ARS por USD) para ARS, así que la
    // conversión inversa es amountBase * exchangeRate. Se guarda contra un TC
    // inválido (0, negativo o no numérico) con fallback a 1 — no debería
    // pasar (createInvoice siempre persiste un TC > 0), pero un balance mal
    // convertido es peor que uno en USD. Si el balance en USD es exactamente
    // 0, se fija "0.00" directo: multiplicar 0 por el TC nunca debería dar
    // otra cosa, pero así queda explícito que no hay margen de redondeo.
    const rate = inv.currency === 'USD' ? 1 : Number(inv.exchangeRate) > 0 ? Number(inv.exchangeRate) : 1
    const balance = balanceBase === 0 ? '0.00' : (balanceBase * rate).toFixed(2)
    return {
      id: inv.id,
      number: inv.number,
      total: inv.total,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issueDate ?? null,
      dueDate: inv.dueDate ?? null,
      balance,
      isOverdue: isInvoiceOverdue(inv, balanceBase),
    }
  })
  return { items, nextCursor }
}

// ─── Estado de proyecto (fase actual + roadmap + novedades) ─────────────────

export interface ClientProjectPhaseDTO {
  id: string
  label: string
  description: string | null
  displayOrder: number
  isCurrent: boolean
  isDone: boolean
}

export interface ClientProjectUpdateDTO {
  id: string
  body: string
  phaseLabel: string | null
  createdAt: Date
}

export interface ClientProjectDTO {
  deal: { id: string; name: string }
  inProduction: boolean
  currentPhase: { id: string; label: string; description: string | null } | null
  phases: ClientProjectPhaseDTO[] | null
  updates: ClientProjectUpdateDTO[]
}

interface ActiveClientDeal {
  id: string
  portalId: string
  name: string
  pipelineId: string
  stageId: string
}

/**
 * Resuelve el deal activo del cliente autenticado, vía client_deal_access.
 * Mismo patrón que `resolveActiveDeal` en onboarding.service.ts (no exportado
 * desde ahí): si el cliente tiene varios deals, toma el más reciente no
 * archivado.
 */
async function resolveActiveClientDeal(clientId: string): Promise<ActiveClientDeal> {
  const [row] = await db
    .select({ id: deal.id, portalId: deal.portalId, name: deal.name, pipelineId: deal.pipelineId, stageId: deal.stageId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, clientId), eq(deal.archived, false)))
    .orderBy(desc(deal.createdAt))
    .limit(1)
  if (!row) throw Errors.notFound('No hay un proyecto activo asociado a esta cuenta')
  return row
}

/**
 * Estado de proyecto visible al cliente: fase actual dentro del pipeline
 * "Producción" (si el deal ya está ahí), roadmap completo de las 9 fases con
 * `isCurrent`/`isDone`, y las novedades curadas por el equipo (no archivadas).
 * Las novedades se devuelven SIEMPRE (aunque el deal todavía esté en Ventas);
 * `currentPhase`/`phases` solo se resuelven si `inProduction` es true.
 */
export async function getClientProject(clientId: string): Promise<ClientProjectDTO> {
  const activeDeal = await resolveActiveClientDeal(clientId)

  const [pl] = await db.select({ id: pipeline.id, label: pipeline.label }).from(pipeline).where(eq(pipeline.id, activeDeal.pipelineId)).limit(1)
  const inProduction = pl?.label === PRODUCTION_PIPELINE_LABEL

  let currentPhase: ClientProjectDTO['currentPhase'] = null
  let phases: ClientProjectPhaseDTO[] | null = null

  if (inProduction) {
    const stages = await db
      .select({
        id: pipelineStage.id,
        label: pipelineStage.label,
        description: pipelineStage.description,
        displayOrder: pipelineStage.displayOrder,
      })
      .from(pipelineStage)
      .where(and(eq(pipelineStage.pipelineId, activeDeal.pipelineId), eq(pipelineStage.archived, false)))
      .orderBy(asc(pipelineStage.displayOrder))

    const current = stages.find((s) => s.id === activeDeal.stageId)
    const currentDisplayOrder = current?.displayOrder ?? -1

    phases = stages.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      displayOrder: s.displayOrder,
      isCurrent: s.id === activeDeal.stageId,
      isDone: s.displayOrder < currentDisplayOrder,
    }))

    if (current) {
      currentPhase = { id: current.id, label: current.label, description: current.description }
    }
  }

  const updateRows = await db
    .select({ id: projectUpdate.id, body: projectUpdate.body, createdAt: projectUpdate.createdAt, stageLabel: pipelineStage.label })
    .from(projectUpdate)
    .leftJoin(pipelineStage, eq(pipelineStage.id, projectUpdate.stageId))
    .where(and(eq(projectUpdate.dealId, activeDeal.id), eq(projectUpdate.archived, false)))
    .orderBy(desc(projectUpdate.createdAt))
    .limit(20)

  const updates: ClientProjectUpdateDTO[] = updateRows.map((u) => ({
    id: u.id,
    body: u.body,
    phaseLabel: u.stageLabel ?? null,
    createdAt: u.createdAt,
  }))

  return {
    deal: { id: activeDeal.id, name: activeDeal.name },
    inProduction,
    currentPhase,
    phases,
    updates,
  }
}

// ─── Carpetas y documentos del cliente (portal) ────────────────────────────
//
// Todas las escrituras exigen `dealId ∈ clientDealIds`: `document.portal_id`
// es el tenant de la AGENCIA, no el de la empresa cliente — sin este chequeo
// un cliente podría escribir en un deal de otra empresa del mismo portal, o
// (con deal_id null) en "Generales", que es de solo lectura para el cliente.
// Fuera de esos ids se responde 404 SIEMPRE, sin distinguir "no existe" de
// "no es tuyo" — mismo criterio que `assertClientCR` en change-requests.

export interface ClientDocumentFolderDTO {
  id: string
  dealId: string
  name: string
  /** Documentos activos dentro de la carpeta (no cuenta los archivados). */
  documentCount: number
  createdAt: Date
  /** Solo las carpetas que el cliente autenticado creó. */
  canManage: boolean
}

function toClientFolderDTO(
  row: { id: string; dealId: string; name: string; createdAt: Date; createdByClientAccountId: string | null },
  documentCount: number,
  clientId: string,
): ClientDocumentFolderDTO {
  return {
    id: row.id,
    dealId: row.dealId,
    name: row.name,
    documentCount,
    createdAt: row.createdAt,
    canManage: row.createdByClientAccountId === clientId,
  }
}

export async function listClientDocumentFolders(clientId: string, dealId: string): Promise<ClientDocumentFolderDTO[]> {
  const ids = await clientDealIds(clientId)
  if (!ids.includes(dealId)) throw Errors.notFound('Proyecto no encontrado')

  const rows = await db
    .select({
      id: documentFolder.id,
      dealId: documentFolder.dealId,
      name: documentFolder.name,
      createdAt: documentFolder.createdAt,
      createdByClientAccountId: documentFolder.createdByClientAccountId,
      documentCount: sql<number>`count(${document.id}) filter (where ${document.archived} = false)::int`,
    })
    .from(documentFolder)
    .leftJoin(document, eq(document.folderId, documentFolder.id))
    .where(and(eq(documentFolder.dealId, dealId), eq(documentFolder.archived, false)))
    .groupBy(documentFolder.id)
    .orderBy(desc(documentFolder.createdAt))

  return rows.map((row) => toClientFolderDTO(row, row.documentCount, clientId))
}

/**
 * El 23505 del índice único parcial `uq_document_folder_deal_name` es la
 * única violación posible de este insert/update — cualquier otro código tiene
 * que seguir siendo un 500, no disfrazarse de "nombre en uso" (mismo criterio
 * que `updateClientBranding` en branding.service.ts con `brand_slug`).
 */
function mapFolderNameConflict(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw Errors.conflict('Ya existe una carpeta con ese nombre en este proyecto')
  }
  throw err
}

export async function createClientDocumentFolder(
  clientId: string,
  portalId: string,
  input: ClientCreateDocumentFolderDTO,
): Promise<ClientDocumentFolderDTO> {
  const ids = await clientDealIds(clientId)
  if (!ids.includes(input.dealId)) throw Errors.notFound('Proyecto no encontrado')

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documentFolder)
        .values({ portalId, dealId: input.dealId, name: input.name, createdByClientAccountId: clientId })
        .returning()
      if (!row) throw Errors.internal('No se pudo crear la carpeta')

      await writeAudit({
        tx,
        portalId,
        clientId,
        entityType: 'document_folder',
        entityId: row.id,
        action: 'CREATE',
        payload: { name: row.name, dealId: input.dealId },
      })

      return toClientFolderDTO(row, 0, clientId)
    })
  } catch (err) {
    return mapFolderNameConflict(err)
  }
}

export async function renameClientDocumentFolder(
  clientId: string,
  portalId: string,
  folderId: string,
  name: string,
): Promise<ClientDocumentFolderDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(documentFolder)
        .where(and(eq(documentFolder.id, folderId), eq(documentFolder.archived, false)))
        .limit(1)
        .for('update')
      if (!row) throw Errors.notFound('Carpeta no encontrada')

      const ids = await clientDealIds(clientId)
      if (!ids.includes(row.dealId)) throw Errors.notFound('Carpeta no encontrada')
      if (row.createdByClientAccountId !== clientId) throw Errors.forbidden('Solo podés renombrar carpetas que creaste')

      const [updated] = await tx.update(documentFolder).set({ name, updatedAt: new Date() }).where(eq(documentFolder.id, folderId)).returning()
      if (!updated) throw Errors.internal('No se pudo renombrar la carpeta')

      await recordFieldChanges({
        tx,
        portalId,
        entityType: 'document_folder',
        entityId: folderId,
        before: { name: row.name },
        after: { name },
        changedBy: null,
        sourceType: 'CLIENT_PORTAL',
      })
      await writeAudit({
        tx,
        portalId,
        clientId,
        entityType: 'document_folder',
        entityId: folderId,
        action: 'RENAME',
        payload: { oldName: row.name, newName: name },
      })

      const [countRow] = await tx
        .select({ documentCount: sql<number>`count(*) filter (where ${document.archived} = false)::int` })
        .from(document)
        .where(eq(document.folderId, folderId))

      return toClientFolderDTO(updated, countRow?.documentCount ?? 0, clientId)
    })
  } catch (err) {
    return mapFolderNameConflict(err)
  }
}

/**
 * Archiva la carpeta (soft delete) y libera sus documentos activos a la raíz
 * del proyecto (`folder_id = null`) en la MISMA transacción — nunca puede
 * quedar una carpeta archivada con documentos todavía colgando de ella.
 */
export async function archiveClientDocumentFolder(clientId: string, portalId: string, folderId: string): Promise<{ movedDocuments: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(documentFolder)
      .where(and(eq(documentFolder.id, folderId), eq(documentFolder.archived, false)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Carpeta no encontrada')

    const ids = await clientDealIds(clientId)
    if (!ids.includes(row.dealId)) throw Errors.notFound('Carpeta no encontrada')
    if (row.createdByClientAccountId !== clientId) throw Errors.forbidden('Solo podés archivar carpetas que creaste')

    const movedDocs = await tx
      .update(document)
      .set({ folderId: null })
      .where(and(eq(document.folderId, folderId), eq(document.archived, false)))
      .returning({ id: document.id })

    if (movedDocs.length > 0) {
      await tx.insert(recordHistory).values(
        movedDocs.map((d) => ({
          portalId,
          entityType: 'document',
          entityId: d.id,
          fieldName: 'folderId',
          oldValue: folderId,
          newValue: null,
          sourceType: 'CLIENT_PORTAL',
          changedBy: null,
        })),
      )
    }

    await tx.update(documentFolder).set({ archived: true, archivedAt: new Date() }).where(eq(documentFolder.id, folderId))
    await writeAudit({
      tx,
      portalId,
      clientId,
      entityType: 'document_folder',
      entityId: folderId,
      action: 'ARCHIVE',
      payload: { movedDocuments: movedDocs.length },
    })

    return { movedDocuments: movedDocs.length }
  })
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export async function createClientDocument(
  clientId: string,
  portalId: string,
  input: ClientCreateDocumentDTO,
): Promise<ClientDocumentDTO> {
  const ids = await clientDealIds(clientId)
  if (!ids.includes(input.dealId)) throw Errors.notFound('Proyecto no encontrado')

  // Fuera de la tx (llamadas de red) — mismo patrón que createDocument (admin)
  // y updateClientBranding.
  const preparedClaim = await prepareUploadClaim({
    storageKey: input.storageKey,
    portalId,
    actor: { kind: 'client', clientId, portalId },
    purpose: 'deal_document',
  })

  return db.transaction(async (tx) => {
    // Folder y deal siempre del mismo proyecto — la FK compuesta de la base
    // ya lo garantiza, pero este guard da un 400 legible antes del insert.
    await assertFolderInDeal(portalId, input.dealId, input.folderId, tx)
    await claimUpload(tx, preparedClaim)

    const [row] = await tx
      .insert(document)
      .values({
        portalId,
        dealId: input.dealId,
        folderId: input.folderId ?? null,
        name: input.name,
        type: 'other',
        source: 'manual',
        storageKey: input.storageKey,
        uploadedByClientAccountId: clientId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el documento')

    await writeAudit({
      tx,
      portalId,
      clientId,
      entityType: 'document',
      entityId: row.id,
      action: 'CREATE',
      payload: { name: row.name, dealId: input.dealId, folderId: row.folderId },
    })

    return getClientDocumentDTOById(row.id, clientId, tx)
  })
}

export async function updateClientDocument(
  clientId: string,
  portalId: string,
  documentId: string,
  patch: ClientUpdateDocumentDTO,
): Promise<ClientDocumentDTO> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.archived, false)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Documento no encontrado')

    const ids = await clientDealIds(clientId)
    if (!row.dealId || !ids.includes(row.dealId)) throw Errors.notFound('Documento no encontrado')
    // Un documento de DocuSeal nunca tiene uploaded_by_client_account_id (lo
    // crea el equipo al mandarlo a firmar): esta condición ya lo cubre, pero
    // se deja explícito porque es una regla de negocio propia, no un efecto
    // colateral de la otra.
    if (row.docusealSubmissionId !== null) throw Errors.forbidden('No podés editar un documento firmado por DocuSeal')
    if (row.uploadedByClientAccountId !== clientId) throw Errors.forbidden('Solo podés editar documentos que subiste')

    // Mover solo dentro del MISMO deal: assertFolderInDeal valida que la
    // carpeta destino pertenezca a `row.dealId` (nunca al de otro proyecto).
    if (patch.folderId !== undefined) await assertFolderInDeal(portalId, row.dealId, patch.folderId, tx)

    const setPatch: { name?: string; folderId?: string | null } = {}
    if (patch.name !== undefined) setPatch.name = patch.name
    if (patch.folderId !== undefined) setPatch.folderId = patch.folderId

    const [updated] = await tx.update(document).set(setPatch).where(eq(document.id, documentId)).returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el documento')

    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'document',
      entityId: documentId,
      before: { name: row.name, folderId: row.folderId },
      after: setPatch,
      changedBy: null,
      sourceType: 'CLIENT_PORTAL',
    })
    await writeAudit({ tx, portalId, clientId, entityType: 'document', entityId: documentId, action: 'UPDATE', payload: setPatch })

    return getClientDocumentDTOById(documentId, clientId, tx)
  })
}

export async function archiveClientDocument(clientId: string, portalId: string, documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.archived, false)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Documento no encontrado')

    const ids = await clientDealIds(clientId)
    if (!row.dealId || !ids.includes(row.dealId)) throw Errors.notFound('Documento no encontrado')
    if (row.docusealSubmissionId !== null) throw Errors.forbidden('No podés archivar un documento firmado por DocuSeal')
    if (row.uploadedByClientAccountId !== clientId) throw Errors.forbidden('Solo podés archivar documentos que subiste')

    await tx.update(document).set({ archived: true, archivedAt: new Date() }).where(eq(document.id, documentId))
    await writeAudit({ tx, portalId, clientId, entityType: 'document', entityId: documentId, action: 'ARCHIVE', payload: { archived: true } })
  })
}
