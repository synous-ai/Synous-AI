import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { deal, pipeline, pipelineStage, contact, company, dealContact, note, task, recordHistory } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { decodeCursor, paginateRows, cursorWhere } from '../../lib/pagination'
import type { ListQuery } from '../../lib/crm-schemas'
import { buildFilter, type FieldMap, type SearchBody } from '../../lib/filter'
import type { CreateDealDTO, UpdateDealDTO } from './deals.schema'

// Re-export stage functions so existing imports from 'deals.service' continue to work.
export { changeStage, activateClientPortal } from './stage.service'

const ENTITY = 'deal'
type DealRow = typeof deal.$inferSelect

/** numeric de Postgres se mapea a string en Drizzle: convertimos amount. */
function toAmount(amount?: number): string | undefined {
  return amount === undefined ? undefined : amount.toFixed(2)
}

async function assertStageInPipeline(tx: Tx, pipelineId: string, stageId: string): Promise<typeof pipelineStage.$inferSelect> {
  const [stage] = await tx.select().from(pipelineStage).where(eq(pipelineStage.id, stageId)).limit(1)
  if (!stage) throw Errors.badRequest('Stage inexistente')
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest('El stage no pertenece al pipeline indicado')
  return stage
}

export async function listDeals(portalId: string, query: ListQuery): Promise<{ items: DealRow[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(deal)
    .where(
      and(eq(deal.portalId, portalId), eq(deal.archived, false), cursor ? cursorWhere(deal.createdAt, deal.id, cursor) : undefined),
    )
    .orderBy(desc(deal.createdAt), desc(deal.id))
    .limit(query.limit + 1)

  return paginateRows(rows, query.limit)
}

export async function getDeal(portalId: string, id: string): Promise<DealRow> {
  const [row] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.portalId, portalId), eq(deal.id, id), eq(deal.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Deal no encontrado')
  return row
}

export async function createDeal(portalId: string, userId: string, input: CreateDealDTO): Promise<DealRow> {
  return db.transaction(async (tx) => {
    // El pipeline debe existir en el portal y el stage pertenecer a ese pipeline.
    const [pl] = await tx
      .select()
      .from(pipeline)
      .where(and(eq(pipeline.id, input.pipelineId), eq(pipeline.portalId, portalId)))
      .limit(1)
    if (!pl) throw Errors.badRequest('Pipeline inexistente')
    await assertStageInPipeline(tx, input.pipelineId, input.stageId)

    const [row] = await tx
      .insert(deal)
      .values({ ...input, amount: toAmount(input.amount), portalId })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el deal')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: 'CREATE', payload: input })
    return row
  })
}

export async function updateDeal(portalId: string, userId: string, id: string, input: UpdateDealDTO): Promise<DealRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.id, id), eq(deal.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Deal no encontrado')

    const patch = { ...input, amount: toAmount(input.amount) }
    const [updated] = await tx
      .update(deal)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(deal.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el deal')

    await recordFieldChanges({ tx, portalId, entityType: ENTITY, entityId: id, before: existing, after: patch, changedBy: userId })
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'UPDATE', payload: input })
    return updated
  })
}

export async function archiveDeal(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.id, id), eq(deal.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Deal no encontrado')
    await tx.update(deal).set({ archived: true, archivedAt: new Date() }).where(eq(deal.id, id))
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'DELETE' })
  })
}

/** Asocia un contacto al deal (join deal_contact). Idempotente. */
export async function addDealContact(portalId: string, dealId: string, contactId: string, role?: string): Promise<void> {
  await getDeal(portalId, dealId) // valida que el deal exista en el portal
  const [c] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.portalId, portalId), eq(contact.id, contactId)))
    .limit(1)
  if (!c) throw Errors.badRequest('Contacto inexistente')
  await db.insert(dealContact).values({ dealId, contactId, role }).onConflictDoNothing()
}

/** Quita la asociación contacto↔deal. */
export async function removeDealContact(portalId: string, dealId: string, contactId: string): Promise<void> {
  await getDeal(portalId, dealId)
  await db.delete(dealContact).where(and(eq(dealContact.dealId, dealId), eq(dealContact.contactId, contactId)))
}

export interface DealDetail {
  deal: DealRow
  company: typeof company.$inferSelect | null
  contacts: (typeof contact.$inferSelect)[]
  notes: (typeof note.$inferSelect)[]
  tasks: (typeof task.$inferSelect)[]
  history: (typeof recordHistory.$inferSelect)[]
}

/** Detalle completo del deal: empresa, contactos asociados, notas, tareas e historial. */
export async function getDealDetail(portalId: string, id: string): Promise<DealDetail> {
  const dealRow = await getDeal(portalId, id) // lanza notFound

  let companyRow: typeof company.$inferSelect | null = null
  if (dealRow.companyId) {
    const [c] = await db.select().from(company).where(eq(company.id, dealRow.companyId)).limit(1)
    companyRow = c ?? null
  }

  const ids = new Set<string>()
  if (dealRow.primaryContactId) ids.add(dealRow.primaryContactId)
  const links = await db.select({ contactId: dealContact.contactId }).from(dealContact).where(eq(dealContact.dealId, id))
  for (const l of links) ids.add(l.contactId)

  let contacts: (typeof contact.$inferSelect)[] = []
  if (ids.size > 0) {
    contacts = await db
      .select()
      .from(contact)
      .where(and(eq(contact.portalId, portalId), inArray(contact.id, [...ids])))
  }

  const notes = await db
    .select()
    .from(note)
    .where(and(eq(note.portalId, portalId), eq(note.dealId, id)))
    .orderBy(desc(note.createdAt))
    .limit(50)
  const tasks = await db
    .select()
    .from(task)
    .where(and(eq(task.portalId, portalId), eq(task.dealId, id)))
    .orderBy(desc(task.createdAt))
    .limit(50)
  const history = await db
    .select()
    .from(recordHistory)
    .where(and(eq(recordHistory.entityType, ENTITY), eq(recordHistory.entityId, id)))
    .orderBy(desc(recordHistory.changedAt))
    .limit(50)

  return { deal: dealRow, company: companyRow, contacts, notes, tasks, history }
}

/** Campos permitidos para búsqueda avanzada de deals. */
const DEAL_FIELDS: FieldMap = {
  name: { column: deal.name, kind: 'text' },
  amount: { column: deal.amount, kind: 'number' },
  currency: { column: deal.currency, kind: 'text' },
  pipelineId: { column: deal.pipelineId, kind: 'text' },
  stageId: { column: deal.stageId, kind: 'text' },
  companyId: { column: deal.companyId, kind: 'text' },
  ownerId: { column: deal.ownerId, kind: 'text' },
  closeDate: { column: deal.closeDate, kind: 'date' },
  createdAt: { column: deal.createdAt, kind: 'date' },
}

export async function searchDeals(
  portalId: string,
  body: SearchBody,
): Promise<{ items: DealRow[]; nextCursor: string | null }> {
  const cond = body.filter ? buildFilter(body.filter, DEAL_FIELDS) : undefined
  const cursor = decodeCursor(body.cursor)
  const rows = await db
    .select()
    .from(deal)
    .where(
      and(eq(deal.portalId, portalId), eq(deal.archived, false), cond, cursor ? cursorWhere(deal.createdAt, deal.id, cursor) : undefined),
    )
    .orderBy(desc(deal.createdAt), desc(deal.id))
    .limit(body.limit + 1)

  return paginateRows(rows, body.limit)
}
