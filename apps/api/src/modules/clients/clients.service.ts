import { and, eq, inArray, desc } from 'drizzle-orm'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { clientAccount, clientDealAccess } from '../../db/schema'
import { listContactsByLifecycle, getContactDetail, type ContactDetail } from '../contacts/contacts.service'
import type { ListQuery } from '../../lib/crm-schemas'

/** Un "cliente" es un contacto cuyo ciclo de vida llegó a customer. */
export const CLIENT_STAGES = ['customer']

export function listClients(portalId: string, query: ListQuery) {
  return listContactsByLifecycle(portalId, CLIENT_STAGES, query)
}

export function getClientDetail(portalId: string, id: string): Promise<ContactDetail> {
  return getContactDetail(portalId, id)
}

// ── Client Accounts (portal de clientes) ────────────────────────────────────

export interface ClientAccountSummaryRow {
  id: string
  email: string
  inviteAccepted: boolean
  isActive: boolean
  createdAt: Date
  dealIds: string[]
}

export async function listClientAccounts(portalId: string, query: ListQuery): Promise<Paginated<ClientAccountSummaryRow>> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select({
      id: clientAccount.id,
      email: clientAccount.email,
      inviteAccepted: clientAccount.inviteAccepted,
      isActive: clientAccount.isActive,
      createdAt: clientAccount.createdAt,
    })
    .from(clientAccount)
    .where(and(eq(clientAccount.portalId, portalId), cursor ? cursorWhere(clientAccount.createdAt, clientAccount.id, cursor) : undefined))
    .orderBy(desc(clientAccount.createdAt), desc(clientAccount.id))
    .limit(query.limit + 1)
  const { items: accounts, nextCursor } = paginateRows(rows, query.limit)

  if (accounts.length === 0) return { items: [], nextCursor }

  const accIds = accounts.map((a) => a.id)
  const accesses = await db
    .select({ clientId: clientDealAccess.clientId, dealId: clientDealAccess.dealId })
    .from(clientDealAccess)
    .where(inArray(clientDealAccess.clientId, accIds))

  // Build deal map per account
  const dealMap = new Map<string, string[]>()
  for (const acc of accesses) {
    if (!dealMap.has(acc.clientId)) dealMap.set(acc.clientId, [])
    dealMap.get(acc.clientId)!.push(acc.dealId)
  }

  const items = accounts.map((a) => ({
    ...a,
    dealIds: dealMap.get(a.id) ?? [],
  }))
  return { items, nextCursor }
}
