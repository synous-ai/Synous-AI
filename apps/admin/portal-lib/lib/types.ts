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

// Change Requests — solicitudes de cambio. Catálogo de estados/acciones ÚNICO
// en @synous/shared (change-requests.ts): lo consumen la API, el admin y el
// portal, así que ninguna superficie vuelve a definir su propio
// `Record<status, label>`. Se re-exportan acá los tipos que ya importaban
// otros archivos de portal-lib desde '@portal/lib/types' (p. ej.
// requests-panel.tsx), para no tener que cambiar esos import paths.
export type {
  ChangeRequestStatus,
  ChangeRequestPriority,
  ChangeRequestBucket,
  CRRejectionReason,
  CRAdjustmentArea,
  CREventType,
  CRActorRole,
  CRProposalStatus,
} from '@synous/shared'
import type {
  ChangeRequestStatus,
  ChangeRequestPriority,
  CRActorRole,
  CRProposalStatus,
  CREventType,
} from '@synous/shared'

/** Fila de `change_request` tal como la devuelve la API (ver contrato del módulo). */
export interface ChangeRequest {
  id: string
  dealId: string
  number: number
  title: string
  description: string
  context: string | null
  priority: ChangeRequestPriority
  origin: 'client' | 'agency'
  status: ChangeRequestStatus
  totalAmount: string | null
  currency: string
  timelineImpactDays: number
  newDeliveryDate: string | null
  proposedScope: string | null
  currentProposalId: string | null
  approvedProposalId: string | null
  /** Motivo de rechazo o área de ajuste, según cuál fue la última decisión — la API no distingue el shape acá. */
  decisionReason: string | null
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
  /**
   * Si ESTE cliente (el que llamó al endpoint) puede cancelar la CR — ya
   * calculado por el backend, que solo deja cancelar a quien la creó. `undefined`
   * mientras el backend todavía no manda el campo (contrato en vuelo): se
   * trata igual que "no mostrar la acción" para no ofrecer un botón que
   * responde 403.
   */
  canCancel?: boolean
}

/** Línea de alcance de una CR o de una propuesta (mismo shape en los dos lugares). */
export interface CRItem {
  description: string
  hours: number | null
  unitPrice: string | number | null
  quantity: number | null
}

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
  items: CRItem[]
}

export interface CRCommentAttachment {
  id: string
  name: string
  storageKey: string
  mimeType: string | null
  sizeBytes: number | null
}

export interface CRComment {
  id: string
  body: string
  authorName: string
  authorRole: CRActorRole
  createdAt: string
  attachments: CRCommentAttachment[]
}

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
  mimeType: string | null
  sizeBytes: number | null
  uploadedByName: string | null
  uploadedRole: CRActorRole
  uploadedAt: string
}

/** GET /api/client/change-requests/:id */
export interface ChangeRequestDetail {
  changeRequest: ChangeRequest
  items: CRItem[]
  proposals: CRProposal[]
  currentProposal: CRProposal | null
  approvedProposal: CRProposal | null
  comments: CRComment[]
  events: CREvent[]
  attachments: CRAttachment[]
  links: { documents: unknown[]; invoices: unknown[]; deliverables: unknown[] }
}

/** GET /api/client/change-requests/summary — contadores reales para las tabs. */
export interface ChangeRequestSummary {
  all: number
  needs_action: number
  in_review: number
  resolved: number
}

/**
 * Adjunto ya subido (vía `uploadFile` de `@portal/lib/files`), listo para
 * mandar en el `uploads` de crear-CR / comentar. Shape inferido de
 * `CRAttachment`/`CRCommentAttachment` — no hay otro caller en el portal que
 * ya mande un array `uploads` para copiarle la forma exacta.
 */
export interface CRUploadRef {
  storageKey: string
  name: string
  mimeType: string
  sizeBytes: number
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
  /** Vencida por fecha (misma lógica que el admin), no por el `status` crudo. */
  isOverdue: boolean
}

// Documentos del cliente (read-only)
export interface ClientDocument {
  id: string
  dealId: string | null
  name: string
  type: string
  storageKey: string | null
  signedAt: string | null
  /**
   * Estado de la firma en DocuSeal — DocuSeal es la fuente de verdad, acá solo
   * se refleja para derivar un label de UI (ver documents-shared.tsx). `null`
   * para documentos que nunca pasaron por un flujo de firma (facturas, otros).
   */
  docusealStatus: 'pending' | 'completed' | 'declined' | 'expired' | null
  /** Nombre de la persona del equipo que subió el documento, ej. "Jeremias Ingla". */
  uploadedBy: string | null
  createdAt: string
}

/**
 * Documento firmado que devuelve DocuSeal para un `ClientDocument` sin
 * `storageKey` propio. Ver GET /api/client/documents/:id/signed-documents y
 * `DocusealDocument` en apps/api/src/modules/documents/docuseal.client.ts —
 * mismo shape. La `url` es EFÍMERA (caduca a los 40 minutos): nunca se
 * persiste ni se cachea, solo vive mientras el drawer de preview está abierto.
 */
export interface ClientDocusealSignedDocument {
  name: string
  url: string
}

// ─── Estado de proyecto (roadmap + novedades) ─────────────────────────────────
// Ver GET /api/client/project — apps/api/src/modules/client/client.service.ts
// (`ClientProjectDTO`). `currentPhase`/`phases` solo vienen resueltos si
// `inProduction` es true; `updates` siempre viene (aunque el deal esté en
// Ventas, sin fase asociada todavía).

export interface ClientProjectPhase {
  id: string
  label: string
  description: string | null
  displayOrder: number
  isCurrent: boolean
  isDone: boolean
}

export interface ClientProjectUpdate {
  id: string
  body: string
  phaseLabel: string | null
  createdAt: string
}

/**
 * Estado del proyecto, DERIVADO en el backend del pipeline y de los flags de
 * la etapa (no hay columna "estado de proyecto"). Ver `ClientProjectStatus` en
 * apps/api/src/modules/client/client.service.ts.
 *
 * `completed` no se dispara con las 9 fases seedeadas hoy (ninguna es
 * `is_closed`): existe para cuando el equipo agregue una fase de cierre.
 */
export type ClientProjectStatus = 'preparation' | 'in_progress' | 'completed'

export interface ClientProject {
  deal: { id: string; name: string }
  status: ClientProjectStatus
  inProduction: boolean
  currentPhase: { id: string; label: string; description: string | null } | null
  /** La fase que sigue por `displayOrder`. `null` en la última o si el proyecto terminó. */
  nextPhase: { id: string; label: string; description: string | null } | null
  phases: ClientProjectPhase[] | null
  /** Entrada al pipeline "Producción" (`record_history`). `null` si no hay rastro. */
  startedAt: string | null
  /** Entrada a la fase actual (`record_history`). `null` si no hay rastro. */
  currentPhaseSince: string | null
  /** `deal.close_date`, solo para deals ya en Producción. `null` si el equipo no lo cargó. */
  estimatedDelivery: string | null
  completedAt: string | null
  updates: ClientProjectUpdate[]
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

// ─── Onboarding POST-VENTA (wizard de 8 pasos, Client Portal) ─────────────────
// Ver apps/api/src/modules/onboarding/{onboarding.schema,client-onboarding.router}.ts
// — contrato verificado contra el código real del backend.

export type OnboardingStatus = 'in_progress' | 'completed'

/** Las 8 claves posibles de `stepsCompleted`, como string (así viaja el JSON). */
export type OnboardingStepKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'

export type OnboardingDeliveryChannel =
  | 'whatsapp'
  | 'notion'
  | 'drive'
  | 'skool'
  | 'circle'
  | 'hotmart'
  | 'kajabi'
  | 'otro'

export const ONBOARDING_DELIVERY_CHANNELS: { value: OnboardingDeliveryChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'notion', label: 'Notion' },
  { value: 'drive', label: 'Drive' },
  { value: 'skool', label: 'Skool' },
  { value: 'circle', label: 'Circle' },
  { value: 'hotmart', label: 'Hotmart' },
  { value: 'kajabi', label: 'Kajabi' },
  { value: 'otro', label: 'Otro' },
]

/** Las 16 respuestas del brief (paso 6). Ver OnboardingBriefSchema en el backend. */
export interface OnboardingBriefAnswers {
  businessProgram: string
  activeClients: string
  deliveryChannels: OnboardingDeliveryChannel[]
  deliveryChannelsOther?: string
  worstChannel: string
  weeklyTimeDrain: string
  sixMonthConcern: string
  idealDayToDay: string
  desiredStudentFeeling: string
  referenceApps: string
  teamRoles: string
  brandIdentity: string
  requiredIntegrations: string
  existingClientBase: string
  howFoundUs: string
  decisionTrigger: string
  doubtsBeforeBuying: string
}

export type OnboardingMaterialCategory = 'logoBrand' | 'programContent' | 'clientBase' | 'toolAccess'

export interface OnboardingMaterialItem {
  done: boolean
  assetIds?: string[]
  note?: string
}

/**
 * `client_onboarding.materials` en DB es `jsonb` con default `{}` — antes del
 * paso 7 puede llegar como objeto vacío, por eso las 4 claves son opcionales acá
 * (no confiar en que siempre estén las 4 presentes).
 */
export type OnboardingMaterialsState = Partial<Record<OnboardingMaterialCategory, OnboardingMaterialItem>>

/** Archivo subido en el paso de materiales (fila de `client_asset`). */
export interface OnboardingAsset {
  id: string
  dealId: string
  fieldName: string | null
  name: string
  type: string
  mimeType: string | null
  storageKey: string
  sizeBytes: number | null
  uploadedAt: string
}

/** Fila de `client_onboarding` tal como la devuelve la API (fechas ya como ISO string). */
export interface ClientOnboarding {
  id: string
  portalId: string
  dealId: string
  clientId: string
  status: OnboardingStatus
  currentStep: number
  stepsCompleted: Partial<Record<OnboardingStepKey, string>>
  signatureName: string | null
  signatureAcceptedAt: string | null
  signatureIp: string | null
  briefAnswers: OnboardingBriefAnswers | null
  /**
   * Borrador PARCIAL del brief (paso 6). El wizard lo guarda al avanzar cada
   * bloque para que un reload no se lleve lo tipeado, y lo usa para rehidratar
   * el formulario. Queda en `null` cuando el brief se envía completo.
   */
  briefDraft: Partial<OnboardingBriefAnswers> | null
  materials: OnboardingMaterialsState
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingStateDTO {
  onboarding: ClientOnboarding
  assets: OnboardingAsset[]
}

/**
 * GET/PATCH /api/client/branding — marca vigente del cliente: la de su empresa,
 * o la de la cuenta si no tiene empresa (ver branding.service.ts).
 */
export interface ClientBranding {
  id: string
  email: string
  brandSlug: string | null
  brandName: string | null
  brandLogoKey: string | null
  /** Ruta PÚBLICA del logo (redirige a una URL de corta vida): funciona en un `<img src>` sin token. */
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

/** PATCH /api/client/branding — solo los campos presentes se escriben; `null` explícito borra el valor. */
export interface UpdateClientBrandingInput {
  brandName?: string | null
  brandLogoKey?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
}

export interface CompleteOnboardingResultDTO {
  onboarding: ClientOnboarding
  ownerId: string | null
  dealName: string
  stageLabel: string
}

// ── Admin (vistas de progreso/detalle en apps/admin/app/admin/(dashboard)/onboarding) ──
// Viven acá (no en apps/admin/lib/types/onboarding.ts) para que TODOS los
// tipos de onboarding tengan una única fuente de verdad — ese archivo
// re-exporta desde acá.

/** GET /api/onboarding — item de listado. */
export interface AdminOnboardingListItemDTO {
  dealId: string
  dealName: string
  clientEmail: string
  status: OnboardingStatus
  currentStep: number
  stepsCompleted: Partial<Record<OnboardingStepKey, string>>
  completedAt: string | null
  updatedAt: string
}

/** GET /api/onboarding/deals/:id — detalle completo de un deal. */
export interface AdminOnboardingDetailDTO {
  onboarding: ClientOnboarding
  assets: OnboardingAsset[]
  dealName: string
  clientEmail: string
}

// ─── Notificaciones del cliente ──────────────────────────────────────────────
// Ver apps/api/src/modules/notifications (prefix /api/client/notifications).

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

/** Fila de `notification` dirigida a un client_account. */
export interface ClientNotification {
  id: string
  type: string
  title: string
  body: string | null
  actionUrl: string | null
  priority: NotificationPriority
  entityType: string | null
  entityId: string | null
  metadata: Record<string, unknown>
  readAt: string | null
  createdAt: string
}
