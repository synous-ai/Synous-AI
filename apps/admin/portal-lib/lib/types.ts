// Envelope común de la API
export interface ApiEnvelope<T> {
  data: T
  meta?: Record<string, unknown>
}

// Entidad cliente autenticado en el portal
export interface Client {
  id: string
  email: string
  contactId: string
  portalId: string
}

// Deal visible para el cliente
export interface Deal {
  id: string
  name: string
  amount: string | null
  currency: string
  stageId: string
  createdAt: string
}

// Intake forms de onboarding del cliente
export type IntakeStatus = 'pending' | 'in_progress' | 'completed'

export type IntakeFieldType = 'text' | 'textarea' | 'email' | 'number' | 'date' | 'file'

export interface IntakeField {
  name: string
  label: string
  type: IntakeFieldType
}

export interface ClientIntake {
  id: string
  title: string
  status: IntakeStatus
  dueDate: string | null
  fields: IntakeField[]
  answers: Record<string, unknown> | null
}

// Change Requests — solicitudes de cambio enviadas por el equipo
export type ChangeRequestStatus =
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'negotiating'
  | 'approved_verbally'
  | 'disputed'
  | 'completed'

export interface ChangeRequest {
  id: string
  dealId: string
  number: number
  title: string
  description: string
  status: ChangeRequestStatus
  totalAmount: string | null
  timelineImpactDays: number
  newDeliveryDate: string | null
  createdAt: string
}

// Facturas del cliente (read-only)
export interface ClientInvoice {
  id: string
  number: number
  total: string
  currency: string
  status: string
  issueDate: string | null
  dueDate: string | null
  balance: string
}

// Documentos del cliente (read-only)
export interface ClientDocument {
  id: string
  dealId: string | null
  name: string
  type: string
  storageKey: string | null
  signedAt: string | null
  createdAt: string
}

// Entregable con estado y acciones
export type DeliverableStatus = 'pending_review' | 'approved' | 'changes_requested'

export interface Deliverable {
  id: string
  dealId: string
  title: string
  description: string | null
  type: string
  url: string | null
  version: number
  status: DeliverableStatus
  feedback: string | null
  createdAt: string
}
