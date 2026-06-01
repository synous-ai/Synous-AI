import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '../../db'
import { contact, deal, dealContact, recordHistory, note, task } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit } from '../../lib/audit'
import { decodeCursor, paginateRows, cursorWhere } from '../../lib/pagination'
import type { ListQuery } from '../../lib/crm-schemas'
import { buildFilter, type FieldMap, type SearchBody } from '../../lib/filter'
import type { CreateContactDTO, UpdateContactDTO } from './contacts.schema'

const ENTITY = 'contact'
type ContactRow = typeof contact.$inferSelect

/** Campos permitidos para búsqueda avanzada de contactos. */
const CONTACT_FIELDS: FieldMap = {
  firstName: { column: contact.firstName, kind: 'text' },
  lastName: { column: contact.lastName, kind: 'text' },
  email: { column: contact.email, kind: 'text' },
  phone: { column: contact.phone, kind: 'text' },
  jobTitle: { column: contact.jobTitle, kind: 'text' },
  lifecycleStage: { column: contact.lifecycleStage, kind: 'enum' },
  companyId: { column: contact.companyId, kind: 'text' },
  ownerId: { column: contact.ownerId, kind: 'text' },
  createdAt: { column: contact.createdAt, kind: 'date' },
}

export async function searchContacts(
  portalId: string,
  body: SearchBody,
): Promise<{ items: ContactRow[]; nextCursor: string | null }> {
  const cond = body.filter ? buildFilter(body.filter, CONTACT_FIELDS) : undefined
  const cursor = decodeCursor(body.cursor)
  const rows = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.portalId, portalId),
        eq(contact.archived, false),
        cond,
        cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(contact.createdAt), desc(contact.id))
    .limit(body.limit + 1)

  return paginateRows(rows, body.limit)
}

export async function listContacts(portalId: string, query: ListQuery): Promise<{ items: ContactRow[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.portalId, portalId),
        eq(contact.archived, false),
        cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(contact.createdAt), desc(contact.id))
    .limit(query.limit + 1)

  return paginateRows(rows, query.limit)
}

export async function getContact(portalId: string, id: string): Promise<ContactRow> {
  const [row] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.portalId, portalId), eq(contact.id, id), eq(contact.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Contacto no encontrado')
  return row
}

export async function createContact(portalId: string, userId: string, input: CreateContactDTO): Promise<ContactRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(contact).values({ ...input, portalId }).returning()
    if (!row) throw Errors.internal('No se pudo crear el contacto')
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: 'CREATE', payload: input })
    return row
  })
}

export async function updateContact(portalId: string, userId: string, id: string, input: UpdateContactDTO): Promise<ContactRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.id, id), eq(contact.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Contacto no encontrado')

    const [updated] = await tx
      .update(contact)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(contact.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el contacto')

    await recordFieldChanges({ tx, portalId, entityType: ENTITY, entityId: id, before: existing, after: input, changedBy: userId })
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'UPDATE', payload: input })
    return updated
  })
}

export async function archiveContact(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.id, id), eq(contact.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Contacto no encontrado')

    await tx.update(contact).set({ archived: true, archivedAt: new Date() }).where(eq(contact.id, id))
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'DELETE' })
  })
}

/**
 * Listado de contactos filtrado por etapas de ciclo de vida (para leads/clients).
 * Reutiliza la paginación por cursor de listContacts.
 */
export async function listContactsByLifecycle(
  portalId: string,
  stages: string[],
  query: ListQuery,
): Promise<{ items: ContactRow[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.portalId, portalId),
        eq(contact.archived, false),
        inArray(contact.lifecycleStage, stages),
        cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(contact.createdAt), desc(contact.id))
    .limit(query.limit + 1)

  return paginateRows(rows, query.limit)
}

export interface ContactDetail {
  contact: ContactRow
  deals: (typeof deal.$inferSelect)[]
  history: (typeof recordHistory.$inferSelect)[]
  notes: (typeof note.$inferSelect)[]
  tasks: (typeof task.$inferSelect)[]
}

/**
 * Detalle enriquecido de un contacto para el User Detail:
 * el contacto + sus deals asociados (como contacto principal o vía deal_contact)
 * + su historial de cambios reciente.
 */
export async function getContactDetail(portalId: string, id: string): Promise<ContactDetail> {
  const contactRow = await getContact(portalId, id) // lanza notFound si no existe

  const primaryDeals = await db
    .select()
    .from(deal)
    .where(and(eq(deal.portalId, portalId), eq(deal.primaryContactId, id), eq(deal.archived, false)))

  const links = await db
    .select({ dealId: dealContact.dealId })
    .from(dealContact)
    .where(eq(dealContact.contactId, id))

  let linkedDeals: (typeof deal.$inferSelect)[] = []
  if (links.length > 0) {
    linkedDeals = await db
      .select()
      .from(deal)
      .where(
        and(
          eq(deal.portalId, portalId),
          eq(deal.archived, false),
          inArray(
            deal.id,
            links.map((l) => l.dealId),
          ),
        ),
      )
  }

  const dealsById = new Map<string, typeof deal.$inferSelect>()
  for (const d of [...primaryDeals, ...linkedDeals]) dealsById.set(d.id, d)

  const history = await db
    .select()
    .from(recordHistory)
    .where(and(eq(recordHistory.entityType, ENTITY), eq(recordHistory.entityId, id)))
    .orderBy(desc(recordHistory.changedAt))
    .limit(50)

  const notes = await db
    .select()
    .from(note)
    .where(and(eq(note.portalId, portalId), eq(note.contactId, id)))
    .orderBy(desc(note.createdAt))
    .limit(50)

  const tasks = await db
    .select()
    .from(task)
    .where(and(eq(task.portalId, portalId), eq(task.contactId, id)))
    .orderBy(desc(task.createdAt))
    .limit(50)

  return { contact: contactRow, deals: [...dealsById.values()], history, notes, tasks }
}
