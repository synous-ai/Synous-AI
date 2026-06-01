import { eq, inArray, desc } from 'drizzle-orm'
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

export async function listClientAccounts(portalId: string): Promise<ClientAccountSummaryRow[]> {
  const accounts = await db
    .select({
      id: clientAccount.id,
      email: clientAccount.email,
      inviteAccepted: clientAccount.inviteAccepted,
      isActive: clientAccount.isActive,
      createdAt: clientAccount.createdAt,
    })
    .from(clientAccount)
    .where(eq(clientAccount.portalId, portalId))
    .orderBy(desc(clientAccount.createdAt))

  if (accounts.length === 0) return []

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

  return accounts.map((a) => ({
    ...a,
    dealIds: dealMap.get(a.id) ?? [],
  }))
}
