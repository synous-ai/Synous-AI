import { listContactsByLifecycle, getContactDetail, type ContactDetail } from '../contacts/contacts.service'
import type { ListQuery } from '../../lib/crm-schemas'

/** Un "lead" es un contacto que todavía no es cliente. */
export const LEAD_STAGES = ['lead', 'mql', 'sql', 'opportunity']

export function listLeads(portalId: string, query: ListQuery) {
  return listContactsByLifecycle(portalId, LEAD_STAGES, query)
}

export function getLeadDetail(portalId: string, id: string): Promise<ContactDetail> {
  return getContactDetail(portalId, id)
}
