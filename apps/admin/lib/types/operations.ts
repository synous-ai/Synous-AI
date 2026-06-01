// ─── Documents ───────────────────────────────────────────────────────────────

export type DocumentType = 'contract' | 'proposal' | 'invoice' | 'other'

export interface Document {
  id: string
  portalId: string
  dealId: string | null
  crId: string | null
  name: string
  type: DocumentType
  source: string | null
  storageKey: string | null
  signedAt: string | null
  createdBy: string | null
  createdAt: string
}

// ─── Work Items ───────────────────────────────────────────────────────────────

export type WorkItemType = 'bug' | 'improvement' | 'roadmap' | 'process'
export type WorkItemStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type WorkItemPriority = 'low' | 'medium' | 'high'

export interface WorkItem {
  id: string
  portalId: string
  type: WorkItemType
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  dealId: string | null
  assignedTo: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Deliverable {
  id: string
  dealId: string
  title: string
  description: string | null
  type: 'design' | 'prototype' | 'staging' | 'final'
  url: string | null
  version: number
  status: 'pending_review' | 'approved' | 'changes_requested'
  feedback: string | null
  createdAt: string
}

export interface ChangeRequest {
  id: string
  dealId: string
  number: number
  title: string
  description: string
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'negotiating' | 'approved_verbally' | 'disputed' | 'completed'
  totalAmount: string | null
  timelineImpactDays: number
  createdAt: string
}

export interface IntakeFormField {
  name: string
  label: string
  type: string
}

export interface IntakeForm {
  id: string
  name: string
  description: string | null
  slug: string
  fields: IntakeFormField[]
}

export interface DealIntake {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  dueDate: string | null
  completedAt: string | null
  formName: string
}

// ─── Change Request Detail ───────────────────────────────────────────────────

export interface CRItem {
  id: string
  changeRequestId: string
  description: string
  hours: string | null
  unitPrice: string
  quantity: string
  subtotal: string | null
}

export interface CRComment {
  id: string
  changeRequestId: string
  body: string
  authorUser: string | null
  authorClient: string | null
  createdAt: string
}

export interface CRHistoryEntry {
  id: string
  changeRequestId: string
  fromStatus: string | null
  toStatus: string
  comment: string | null
  changedByUser: string | null
  changedByClient: string | null
  changedAt: string
}

export interface CRDetail {
  changeRequest: ChangeRequest & {
    originalScopeRef: string | null
    origin: string
    version: number
    newDeliveryDate: string | null
    approvedAt: string | null
    approvedBy: string | null
    completedAt: string | null
    createdBy: string | null
    updatedAt: string
  }
  items: CRItem[]
  comments: CRComment[]
  history: CRHistoryEntry[]
}
