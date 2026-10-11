import type {
  ChangeRequestStatus,
  ChangeRequestPriority,
  CRRejectionReason,
  CREventType,
  CRActorRole,
  CRProposalStatus,
} from '@synous/shared'

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
  /** false = documento interno del equipo; el cliente no lo ve en su Portal. */
  visibleToClient: boolean
  createdBy: string | null
  createdAt: string
}

// ─── Work Items ───────────────────────────────────────────────────────────────

export type WorkItemType = 'bug' | 'improvement' | 'roadmap' | 'process'
export type WorkItemStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type WorkItemPriority = 'low' | 'medium' | 'high'
/** Horizonte de planificación para ítems de tipo 'roadmap'. */
export type WorkItemTimeframe = 'now' | 'next' | 'later'

export interface WorkItem {
  id: string
  portalId: string
  type: WorkItemType
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  /**
   * Solo aplica a type='roadmap'.
   * 'now' = ciclo actual, 'next' = próximo ciclo, 'later' = backlog estratégico.
   */
  timeframe: WorkItemTimeframe | null
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
  /** false = material interno del equipo; el cliente no lo ve en su Portal. */
  visibleToClient: boolean
  createdAt: string
}

/**
 * Novedad de proyecto ("estado de proyecto visible al cliente") curada por el
 * equipo. Ver apps/api/src/modules/deals/project-updates.service.ts
 * (`AdminProjectUpdateDTO`) — `GET /api/deals/:id/updates`, admin-only, trae
 * TODAS las novedades (incluidas las archivadas, con `archived`/`archivedAt`).
 * El cliente en su portal solo ve las no archivadas vía `GET /api/client/project`.
 */
export interface ProjectUpdate {
  id: string
  body: string
  archived: boolean
  archivedAt: string | null
  createdAt: string
  phaseLabel: string | null
  createdBy: { id: string; firstName: string | null; email: string }
}

/**
 * Change Request — columnas núcleo (camelCase), tal como las devuelve la API.
 * Estados, prioridad y tono visual viven en el catálogo compartido
 * `@synous/shared` (`ChangeRequestStatus`, `CHANGE_REQUEST_STATUS_META`,
 * `ADMIN_TRANSITIONS`) — NUNCA se redefinen acá ni se hardcodea la matriz de
 * transiciones o los labels en una página.
 */
export interface ChangeRequest {
  id: string
  dealId: string
  number: number
  title: string
  description: string
  /** Motivo / contexto de negocio detrás del pedido (opcional). */
  context: string | null
  priority: ChangeRequestPriority
  /** Quién originó la CR: el cliente desde el portal, o el equipo desde el admin. */
  origin: 'client' | 'agency'
  status: ChangeRequestStatus
  totalAmount: string | null
  currency: string
  timelineImpactDays: number
  newDeliveryDate: string | null
  /** Alcance propuesto vigente (texto resumen), reflejo de la propuesta actual/aceptada. */
  proposedScope: string | null
  originalScopeRef: string | null
  currentProposalId: string | null
  approvedProposalId: string | null
  /** Motivo estructurado cuando el cliente rechazó o pidió ajuste. */
  decisionReason: CRRejectionReason | null
  decisionComment: string | null
  submittedAt: string | null
  reviewStartedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  cancelledAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  dealName: string | null
  requestedByName: string | null
  requestedByRole: 'admin' | 'client'
}

/**
 * Fila del listado de CRs. Hoy es idéntica a `ChangeRequest` (ya trae
 * `dealName` para la cola global sin filtrar por deal) — se mantiene como
 * alias con nombre propio porque el listado y el detalle son casos de uso
 * distintos y podrían divergir a futuro (ej: el listado agregando conteos).
 */
export type ChangeRequestListItem = ChangeRequest

/** Resumen de contadores reales del backend — alimenta los tabs del listado. */
export interface CRSummary {
  all: number
  needs_action: number
  in_review: number
  resolved: number
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
// Formas alineadas 1:1 con el contrato congelado de `GET /api/change-requests/:id`
// (ver instrucciones de la tarea). El backend es la fuente de verdad de estados
// y transiciones — estos tipos solo describen la forma de la respuesta.

/** Ítem de la solicitud ORIGINAL del cliente/equipo (no confundir con los ítems de una propuesta). */
export interface CRItem {
  id: string
  changeRequestId: string
  description: string
  hours: string | null
  unitPrice: string
  quantity: string
  subtotal: string | null
}

export interface CRProposalItem {
  id: string
  description: string
  hours: string | null
  unitPrice: string
  quantity: string
  subtotal: string | null
}

/** Una versión de propuesta del equipo. `version` es incremental por CR (1, 2, 3…). */
export interface CRProposal {
  id: string
  changeRequestId: string
  version: number
  scope: string | null
  amount: string | null
  currency: string
  timelineImpactDays: number | null
  newDeliveryDate: string | null
  note: string | null
  status: CRProposalStatus
  createdAt: string
  sentAt: string | null
  decidedAt: string | null
  items: CRProposalItem[]
}

export interface CRCommentAttachment {
  id: string
  name: string
  storageKey: string
  /** Nullable: la columna DB (`change_request_attachment.mime_type`) admite NULL. */
  mimeType: string | null
  /** Nullable: la columna DB (`change_request_attachment.size_bytes`) admite NULL. */
  sizeBytes: number | null
}

export interface CRComment {
  id: string
  body: string
  authorName: string | null
  authorRole: 'admin' | 'client'
  createdAt: string
  attachments: CRCommentAttachment[]
}

/**
 * Evento del historial. `metadata` es JSON estructurado (montos, días, versión
 * de propuesta, motivo) — el timeline se construye a partir de `eventType` +
 * `metadata`, nunca de texto preformateado.
 */
export interface CREvent {
  id: string
  eventType: CREventType
  fromStatus: ChangeRequestStatus | null
  toStatus: ChangeRequestStatus | null
  comment: string | null
  metadata: Record<string, unknown>
  actorRole: CRActorRole
  actorName: string | null
  changedAt: string
}

export interface CRAttachment {
  id: string
  name: string
  storageKey: string
  /** Nullable: la columna DB (`change_request_attachment.mime_type`) admite NULL. */
  mimeType: string | null
  /** Nullable: la columna DB (`change_request_attachment.size_bytes`) admite NULL. */
  sizeBytes: number | null
  uploadedByName: string | null
  uploadedRole: 'admin' | 'client'
  uploadedAt: string
}

/** Ver `CRLinkedDocument` real en apps/api/src/modules/change-requests/cr-detail.ts */
export interface CRLinkedDocument {
  id: string
  name: string
  type: DocumentType
  storageKey: string | null
  visibleToClient: boolean
  createdAt: string
}

/** Ver `CRLinkedInvoice` real en apps/api/src/modules/change-requests/cr-detail.ts */
export interface CRLinkedInvoice {
  id: string
  number: number
  status: string
  total: string
  currency: string
  issueDate: string | null
  dueDate: string | null
}

/** Ver `CRLinkedDeliverable` real en apps/api/src/modules/change-requests/cr-detail.ts */
export interface CRLinkedDeliverable {
  id: string
  title: string
  type: string
  status: string
  visibleToClient: boolean
}

export interface CRDetail {
  changeRequest: ChangeRequest
  items: CRItem[]
  proposals: CRProposal[]
  /** La propuesta VIGENTE ya enviada (o decidida). `null` si todavía no se envió ninguna. */
  currentProposal: CRProposal | null
  /**
   * La propuesta en BORRADOR en curso, separada de `currentProposal` (que solo
   * puede ser una propuesta ya enviada). `null` si no hay ningún borrador
   * abierto. Campo nuevo de contrato — el backend puede no mandarlo todavía
   * mientras se termina de implementar; por eso queda opcional además de
   * nullable.
   */
  draftProposal?: CRProposal | null
  approvedProposal: CRProposal | null
  comments: CRComment[]
  events: CREvent[]
  attachments: CRAttachment[]
  links: {
    documents: CRLinkedDocument[]
    invoices: CRLinkedInvoice[]
    deliverables: CRLinkedDeliverable[]
  }
}
