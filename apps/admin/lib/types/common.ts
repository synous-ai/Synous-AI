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
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked'
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

/**
 * Discrimina si un ítem de tipo 'sop' es un procedimiento paso a paso
 * o un checklist de verificación. Ambos se gestionan desde /library/sops.
 */
export type LibraryKind = 'procedure' | 'checklist'

/**
 * Un paso dentro de un SOP o procedimiento de referencia.
 * GUARDRAIL: sin campos de estado (done, checked, completedAt, etc.).
 * Los pasos son CONTENIDO DE REFERENCIA — no un tracker de ejecución.
 */
export interface LibraryStep {
  title: string
  body?: string
}

export interface LibraryItem {
  id: string
  portalId: string
  type: LibraryItemType
  category: string | null
  name: string
  description: string | null
  storageKey: string | null
  url: string | null
  /** Lista ordenada de pasos del SOP/procedimiento. Vacía [] si no aplica. */
  steps: LibraryStep[]
  /**
   * Discrimina el subtipo dentro de 'sop': 'procedure' (pasos numerados)
   * o 'checklist' (ítems de verificación con bullet Square estático).
   * Null para todos los demás tipos de ítem.
   */
  kind: LibraryKind | null
  /** ID del hub_user responsable del ítem (nullable). */
  ownerId: string | null
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
