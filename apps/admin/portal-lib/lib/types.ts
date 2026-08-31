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

export interface ClientProject {
  deal: { id: string; name: string }
  inProduction: boolean
  currentPhase: { id: string; label: string; description: string | null } | null
  phases: ClientProjectPhase[] | null
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
  materials: OnboardingMaterialsState
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingStateDTO {
  onboarding: ClientOnboarding
  assets: OnboardingAsset[]
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
