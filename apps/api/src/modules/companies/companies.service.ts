import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { company, contact, deal, note, task, recordHistory } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit } from '../../lib/audit'
import { decodeCursor, paginateRows, cursorWhere } from '../../lib/pagination'
import { uniqueCompanySlug } from '../../lib/slug'
import { provisionTenantDomain } from '../../lib/tenant-domain'
import type { ListQuery } from '../../lib/crm-schemas'
import { logoUrl } from '../branding/branding.service'
import type { CreateCompanyDTO, UpdateCompanyDTO } from './companies.schema'

const ENTITY = 'company'
type CompanyRow = typeof company.$inferSelect

export interface CompanyDetail {
  /** `logoUrl` es derivado (no una columna): la URL pública de corta vida del logo, si hay uno. */
  company: CompanyRow & { logoUrl: string | null }
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
  const row = await db.transaction(async (tx) => {
    // Slug del tenant: se asigna una única vez, acá. `updateCompany` NUNCA lo
    // regenera al renombrar (ver comentario ahí) — evita romper URLs ya repartidas.
    const slug = await uniqueCompanySlug(tx, portalId, input.name)
    const [created] = await tx.insert(company).values({ ...input, portalId, slug }).returning()
    if (!created) throw Errors.internal('No se pudo crear la empresa')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: created.id, action: 'CREATE', payload: input })
    return created
  })

  // Alta del subdominio `<slug>.<raíz>` en Vercel — DESPUÉS del commit.
  //
  // Fuera de la transacción a propósito: es un efecto EXTERNO e irreversible
  // desde acá. Adentro, un rollback posterior dejaría un subdominio vivo
  // apuntando a una empresa que no existe. Mismo criterio que el email de
  // invitación al portal (ver activateClientPortal).
  //
  // Se await-ea —no es fire-and-forget— para que el alta quede resuelta antes
  // de responder: la llamada tarda menos de un segundo y tiene timeout de 10s.
  // `provisionTenantDomain` NUNCA lanza: si Vercel falla, la empresa ya está
  // creada y su portal sigue alcanzable por `/c/<slug>`; lo único pendiente es
  // el certificado, que se reintenta a mano con `vercel domains add`.
  if (row.slug) await provisionTenantDomain(row.slug)

  return row
}

export async function updateCompany(portalId: string, userId: string, id: string, input: UpdateCompanyDTO): Promise<CompanyRow> {
  // NOTA: `input` (CreateCompanySchema.partial()) no incluye `slug` — no hay
  // forma de pisarlo desde acá aunque se renombre la empresa, y es a propósito:
  // el slug es la URL del tenant (subdominio / `/c/<slug>`), y regenerarlo al
  // renombrar rompería links ya repartidos al cliente. Un slug desactualizado
  // tras un rename es un costo menor que eso.
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
      .where(and(eq(note.portalId, portalId), eq(note.companyId, id), eq(note.archived, false)))
      .orderBy(desc(note.createdAt))
      .limit(50),
    db
      .select()
      .from(task)
      .where(and(eq(task.portalId, portalId), eq(task.companyId, id), eq(task.archived, false)))
      .orderBy(desc(task.createdAt)),
    db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, ENTITY), eq(recordHistory.entityId, id)))
      .orderBy(desc(recordHistory.changedAt))
      .limit(50),
  ])

  return { company: { ...companyRow, logoUrl: logoUrl(companyRow.brandLogoKey) }, contacts, deals, notes, tasks, history }
}
