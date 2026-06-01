import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { company, contact, deal, note, task, recordHistory } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit } from '../../lib/audit'
import { decodeCursor, paginateRows, cursorWhere } from '../../lib/pagination'
import type { ListQuery } from '../../lib/crm-schemas'
import type { CreateCompanyDTO, UpdateCompanyDTO } from './companies.schema'

const ENTITY = 'company'
type CompanyRow = typeof company.$inferSelect

export interface CompanyDetail {
  company: CompanyRow
  contacts: (typeof contact.$inferSelect)[]
  deals: (typeof deal.$inferSelect)[]
  notes: (typeof note.$inferSelect)[]
  tasks: (typeof task.$inferSelect)[]
  history: (typeof recordHistory.$inferSelect)[]
}

export async function listCompanies(portalId: string, query: ListQuery): Promise<{ items: CompanyRow[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(company)
    .where(
      and(
        eq(company.portalId, portalId),
        eq(company.archived, false),
        cursor ? cursorWhere(company.createdAt, company.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(company.createdAt), desc(company.id))
    .limit(query.limit + 1)

  return paginateRows(rows, query.limit)
}

export async function getCompany(portalId: string, id: string): Promise<CompanyRow> {
  const [row] = await db
    .select()
    .from(company)
    .where(and(eq(company.portalId, portalId), eq(company.id, id), eq(company.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Empresa no encontrada')
  return row
}

export async function createCompany(portalId: string, userId: string, input: CreateCompanyDTO): Promise<CompanyRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(company).values({ ...input, portalId }).returning()
    if (!row) throw Errors.internal('No se pudo crear la empresa')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: 'CREATE', payload: input })
    return row
  })
}

export async function updateCompany(portalId: string, userId: string, id: string, input: UpdateCompanyDTO): Promise<CompanyRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(company)
      .where(and(eq(company.portalId, portalId), eq(company.id, id), eq(company.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Empresa no encontrada')

    const [updated] = await tx
      .update(company)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(company.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar la empresa')

    await recordFieldChanges({ tx, portalId, entityType: ENTITY, entityId: id, before: existing, after: input, changedBy: userId })
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'UPDATE', payload: input })
    return updated
  })
}

export async function archiveCompany(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(company)
      .where(and(eq(company.portalId, portalId), eq(company.id, id), eq(company.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Empresa no encontrada')

    await tx.update(company).set({ archived: true, archivedAt: new Date() }).where(eq(company.id, id))
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'DELETE' })
  })
}

/**
 * Detalle enriquecido de una empresa:
 * la empresa + contactos + deals + notas + tareas + historial de cambios.
 */
export async function getCompanyDetail(portalId: string, id: string): Promise<CompanyDetail> {
  const companyRow = await getCompany(portalId, id) // lanza notFound si no existe/archivada

  const [contacts, deals, notes, tasks, history] = await Promise.all([
    db
      .select()
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.companyId, id), eq(contact.archived, false)))
      .orderBy(desc(contact.createdAt)),
    db
      .select()
      .from(deal)
      .where(and(eq(deal.portalId, portalId), eq(deal.companyId, id), eq(deal.archived, false)))
      .orderBy(desc(deal.createdAt)),
    db
      .select()
      .from(note)
      .where(and(eq(note.portalId, portalId), eq(note.companyId, id)))
      .orderBy(desc(note.createdAt))
      .limit(50),
    db
      .select()
      .from(task)
      .where(and(eq(task.portalId, portalId), eq(task.companyId, id)))
      .orderBy(desc(task.createdAt)),
    db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, ENTITY), eq(recordHistory.entityId, id)))
      .orderBy(desc(recordHistory.changedAt))
      .limit(50),
  ])

  return { company: companyRow, contacts, deals, notes, tasks, history }
}
