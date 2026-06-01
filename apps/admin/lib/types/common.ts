export interface ApiEnvelope<T> {
  data: T
  meta?: { nextCursor?: string | null; total?: number }
}

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  entityType: string | null
  entityId: string | null
  actionUrl: string | null
  readAt: string | null
  createdAt: string
}

export interface Note {
  id: string
  body: string
  createdBy: string | null
  dealId: string | null
  contactId: string | null
  companyId: string | null
  createdAt: string
}

export interface Task {
  id: string
  title: string
  body: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  dueDate: string | null
  completedAt: string | null
  assignedTo: string | null
  dealId: string | null
  contactId: string | null
  companyId: string | null
  createdAt: string
}

export interface RecordHistoryEntry {
  id: string
  fieldName: string
  oldValue: string | null
  newValue: string | null
  sourceType: string | null
  changedAt: string
}

export interface TimelineItem {
  kind: 'call' | 'meeting' | 'email' | 'note' | 'task' | 'history'
  id: string
  title: string
  body: string | null
  occurredAt: string
  meta?: Record<string, unknown>
}

// Minimal deal shape for dashboard — avoids circular dependency with crm.ts
export interface DashboardDeal {
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

export interface DashboardData {
  counts: { leads: number; clients: number; companies: number; openTasks: number }
  pipeline: { openDeals: number; openValue: string; weightedForecast: string }
  dealsByStage: { stageId: string; label: string; deals: number; value: string }[]
  recentTasks: Task[]
  recentDeals: DashboardDeal[]
}

export type LibraryItemType =
  | 'document'
  | 'sop'
  | 'template'
  | 'contract_base'
  | 'proposal_base'
  | 'checklist'
  | 'tech_doc'

export interface LibraryItem {
  id: string
  portalId: string
  type: LibraryItemType
  category: string | null
  name: string
  description: string | null
  storageKey: string | null
  url: string | null
  createdBy: string | null
  createdAt: string
}

export interface NotificationPref {
  id: string
  portalId: string
  userId: string
  eventType: string
  inApp: boolean
  email: boolean
  createdAt: string
  updatedAt: string
}
