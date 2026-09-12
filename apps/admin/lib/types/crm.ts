import type { Note, Task, RecordHistoryEntry } from './common'

export interface Contact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  companyId: string | null
  lifecycleStage: string
  createdAt: string
  ownerId: string | null
  custom?: Record<string, unknown> | null
}

export interface Company {
  id: string
  name: string
  domain: string | null
  industry: string | null
  phone: string | null
  website: string | null
  ownerId: string | null
  createdAt: string
}

export interface Stage {
  id: string
  pipelineId: string
  label: string
  displayOrder: number
  probability: string | null
  isClosed: boolean
  isWon: boolean
  exitCriteria: string | null
  description: string | null
}

export interface Pipeline {
  id: string
  label: string
  displayOrder: number
  stages: Stage[]
}

export interface Deal {
  id: string
  name: string
  amount: string | null
  currency: string
  pipelineId: string
  stageId: string
  primaryContactId: string | null
  companyId: string | null
  closeDate: string | null
  ownerId: string | null
  createdAt: string
}

export interface ContactDetail {
  contact: Contact
  deals: Deal[]
  history: RecordHistoryEntry[]
  notes: Note[]
  tasks: Task[]
}

/**
 * Estado del Client Portal para el contacto principal del deal.
 * OJO: `active` significa que el contacto YA ES cliente del portal (por
 * email, a nivel cuenta) — no necesariamente que tenga acceso a ESTE deal
 * puntual (si el mismo contacto es cliente por otro deal, igual da `active`).
 * Para la UI alcanza con no volver a ofrecer "invitar" en ese caso.
 */
export interface DealClientPortalStatus {
  status: 'active' | 'not_activated'
  email: string | null
}

export interface DealDetail {
  deal: Deal
  company: Company | null
  contacts: Contact[]
  notes: Note[]
  tasks: Task[]
  history: RecordHistoryEntry[]
  clientPortal: DealClientPortalStatus
}

export interface CompanyDetail {
  company: Company
  contacts: Contact[]
  deals: Deal[]
  notes: Note[]
  tasks: Task[]
  history: RecordHistoryEntry[]
}
