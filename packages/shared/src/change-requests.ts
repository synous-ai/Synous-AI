/**
 * Catálogo ÚNICO del dominio Change Request (Solicitudes).
 *
 * Vive en `@synous/shared` porque lo consumen las TRES superficies:
 * la API (validación + autoridad de transiciones), el panel admin y el portal
 * del cliente. Antes cada superficie repetía su propio `Record<status, label>`
 * y su propia idea de qué acciones correspondían a cada estado: el portal
 * mostraba "Aprobar" en estados que la API rechazaba, y agregar un estado
 * obligaba a tocar cuatro archivos sin que nada avisara si te olvidabas de uno.
 *
 * Reglas:
 * - El BACKEND es la autoridad: `ADMIN_TRANSITIONS` / `CLIENT_TRANSITIONS` se
 *   validan en el service, nunca solo en la UI.
 * - Los tonos son SEMÁNTICOS, no clases de Tailwind: cada superficie mapea
 *   `tone` a su propio sistema visual (Badge del portal, StatusBadge del admin).
 */

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/**
 * Orden = avance del flujo. `approved_verbally` y `disputed` son estados
 * HEREDADOS (existen filas con esos valores y el check constraint los acepta):
 * se mantienen para no romper datos ni la UI vieja del admin, pero el flujo
 * nuevo no los propone como paso normal.
 */
export const CHANGE_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'sent',
  'negotiating',
  'approved_verbally',
  'approved',
  'disputed',
  'rejected',
  'cancelled',
  'completed',
] as const

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number]

/** Tono semántico. Cada superficie lo traduce a su sistema visual. */
export type ChangeRequestTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export interface ChangeRequestStatusMeta {
  /** Etiqueta para el equipo (panel admin). */
  adminLabel: string
  /** Etiqueta para el cliente (portal). Puede diferir: el admin ve "Esperando al cliente", el cliente ve "Requiere tu decisión". */
  clientLabel: string
  tone: ChangeRequestTone
  /** Quién tiene la pelota. Alimenta los contadores y el "qué está esperando". */
  waitingOn: 'agency' | 'client' | 'none'
}

export const CHANGE_REQUEST_STATUS_META: Record<ChangeRequestStatus, ChangeRequestStatusMeta> = {
  draft: { adminLabel: 'Borrador', clientLabel: 'Borrador', tone: 'neutral', waitingOn: 'agency' },
  submitted: { adminLabel: 'Nueva solicitud', clientLabel: 'Enviada', tone: 'info', waitingOn: 'agency' },
  under_review: { adminLabel: 'En revisión', clientLabel: 'En revisión', tone: 'info', waitingOn: 'agency' },
  sent: { adminLabel: 'Esperando al cliente', clientLabel: 'Requiere tu decisión', tone: 'warning', waitingOn: 'client' },
  negotiating: { adminLabel: 'Ajuste pedido', clientLabel: 'En negociación', tone: 'warning', waitingOn: 'agency' },
  approved_verbally: { adminLabel: 'Aprobada verbalmente', clientLabel: 'Aprobada verbalmente', tone: 'success', waitingOn: 'agency' },
  approved: { adminLabel: 'Aprobada', clientLabel: 'Aprobada', tone: 'success', waitingOn: 'agency' },
  disputed: { adminLabel: 'En disputa', clientLabel: 'En revisión', tone: 'warning', waitingOn: 'agency' },
  rejected: { adminLabel: 'Rechazada', clientLabel: 'Rechazada', tone: 'danger', waitingOn: 'none' },
  cancelled: { adminLabel: 'Cancelada', clientLabel: 'Cancelada', tone: 'neutral', waitingOn: 'none' },
  completed: { adminLabel: 'Completada', clientLabel: 'Completada', tone: 'success', waitingOn: 'none' },
}

/** Un borrador es interno del equipo: el cliente no debe verlo NUNCA (ni en listados ni en detalle). */
export const CLIENT_VISIBLE_STATUSES: readonly ChangeRequestStatus[] = CHANGE_REQUEST_STATUSES.filter(
  (s) => s !== 'draft',
)

/** Estados terminales: no admiten ninguna transición saliente. */
export const CHANGE_REQUEST_TERMINAL_STATUSES: readonly ChangeRequestStatus[] = ['rejected', 'cancelled', 'completed']

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

/**
 * Transiciones que puede aplicar el EQUIPO. El service las valida antes de
 * escribir: el enum de Zod solo garantiza que el estado exista, no que el salto
 * sea legal.
 */
export const ADMIN_TRANSITIONS: Record<ChangeRequestStatus, readonly ChangeRequestStatus[]> = {
  draft: ['sent', 'cancelled'],
  submitted: ['under_review', 'sent', 'rejected', 'cancelled'],
  under_review: ['sent', 'rejected', 'cancelled'],
  // `sent → sent` es legal A PROPÓSITO: es reenviar una propuesta corregida
  // mientras el cliente todavía no respondió. Sin esto, el único camino para
  // corregir un precio mal puesto era mover la CR a `negotiating` a mano,
  // fingiendo un pedido de ajuste que el cliente nunca hizo — falsear el
  // historial para sortear la máquina de estados.
  sent: ['sent', 'negotiating', 'approved', 'approved_verbally', 'rejected', 'cancelled'],
  negotiating: ['sent', 'approved', 'approved_verbally', 'rejected', 'cancelled'],
  approved_verbally: ['approved', 'completed', 'cancelled'],
  approved: ['completed', 'cancelled'],
  disputed: ['sent', 'negotiating', 'rejected', 'cancelled'],
  rejected: [],
  cancelled: [],
  completed: [],
}

/** Acciones del CLIENTE sobre una CR (no son "estados libres": cada una tiene su endpoint dedicado). */
export type ChangeRequestClientAction = 'approve' | 'reject' | 'request_adjustment' | 'cancel'

/**
 * Estado destino de cada acción del cliente, por estado de origen.
 *
 * `sent` es el ÚNICO estado en el que el cliente decide: es el estado en el que
 * hay una propuesta vigente esperando respuesta. En `negotiating` la pelota es
 * del equipo (el cliente ya pidió el ajuste); vuelve a decidir cuando el equipo
 * reenvía la propuesta y la CR regresa a `sent`.
 */
export const CLIENT_TRANSITIONS: Partial<
  Record<ChangeRequestStatus, Partial<Record<ChangeRequestClientAction, ChangeRequestStatus>>>
> = {
  submitted: { cancel: 'cancelled' },
  under_review: { cancel: 'cancelled' },
  sent: { approve: 'approved', reject: 'rejected', request_adjustment: 'negotiating' },
  negotiating: { cancel: 'cancelled' },
}

/** ¿La CR está esperando una decisión del cliente (aprobar / rechazar / pedir ajuste)? */
export function isClientDecidable(status: ChangeRequestStatus): boolean {
  const actions = CLIENT_TRANSITIONS[status]
  return Boolean(actions?.approve)
}

/** Acciones que el cliente puede ejecutar HOY sobre una CR en ese estado. */
export function clientActionsFor(status: ChangeRequestStatus): ChangeRequestClientAction[] {
  return Object.keys(CLIENT_TRANSITIONS[status] ?? {}) as ChangeRequestClientAction[]
}

// ---------------------------------------------------------------------------
// Agrupación para tabs / contadores
// ---------------------------------------------------------------------------

export type ChangeRequestBucket = 'needs_action' | 'in_review' | 'resolved'

export const CHANGE_REQUEST_BUCKET_LABEL: Record<ChangeRequestBucket, string> = {
  needs_action: 'Requieren acción',
  in_review: 'En revisión',
  resolved: 'Resueltas',
}

/**
 * Bucket desde la perspectiva del CLIENTE: "requiere acción" = la pelota es suya.
 * Se calcula desde `waitingOn` para que agregar un estado no obligue a tocar
 * también esta función.
 */
export function clientBucketFor(status: ChangeRequestStatus): ChangeRequestBucket {
  const meta = CHANGE_REQUEST_STATUS_META[status]
  if (meta.waitingOn === 'client') return 'needs_action'
  if (meta.waitingOn === 'none') return 'resolved'
  return 'in_review'
}

/** Bucket desde la perspectiva del EQUIPO: se invierte quién tiene la pelota. */
export function adminBucketFor(status: ChangeRequestStatus): ChangeRequestBucket {
  const meta = CHANGE_REQUEST_STATUS_META[status]
  if (meta.waitingOn === 'agency') return 'needs_action'
  if (meta.waitingOn === 'none') return 'resolved'
  return 'in_review'
}

// ---------------------------------------------------------------------------
// Prioridad
// ---------------------------------------------------------------------------

export const CHANGE_REQUEST_PRIORITIES = ['low', 'normal', 'high'] as const
export type ChangeRequestPriority = (typeof CHANGE_REQUEST_PRIORITIES)[number]

export const CHANGE_REQUEST_PRIORITY_LABEL: Record<ChangeRequestPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
}

// ---------------------------------------------------------------------------
// Motivos estructurados (rechazo / pedido de ajuste)
// ---------------------------------------------------------------------------

export const CR_REJECTION_REASONS = ['cost', 'timeline', 'no_longer_needed', 'requirement_changed', 'other'] as const
export type CRRejectionReason = (typeof CR_REJECTION_REASONS)[number]

export const CR_REJECTION_REASON_LABEL: Record<CRRejectionReason, string> = {
  cost: 'Costo',
  timeline: 'Plazo',
  no_longer_needed: 'Ya no es necesario',
  requirement_changed: 'Cambió el requerimiento',
  other: 'Otro',
}

export const CR_ADJUSTMENT_AREAS = ['scope', 'price', 'timeline', 'other'] as const
export type CRAdjustmentArea = (typeof CR_ADJUSTMENT_AREAS)[number]

export const CR_ADJUSTMENT_AREA_LABEL: Record<CRAdjustmentArea, string> = {
  scope: 'Alcance',
  price: 'Precio',
  timeline: 'Plazo',
  other: 'Otro',
}

// ---------------------------------------------------------------------------
// Eventos del historial
// ---------------------------------------------------------------------------

/**
 * Tipos de evento del historial (`change_request_history.event_type`).
 *
 * El historial NO guarda solo texto formateado: cada fila lleva `metadata`
 * estructurada (montos, días, versión de propuesta, motivo) para poder
 * reconstruir DESPUÉS qué propuesta terminó aprobando el cliente.
 */
export const CR_EVENT_TYPES = [
  'created',
  'submitted',
  'review_started',
  'proposal_sent',
  'proposal_updated',
  'status_changed',
  'comment_added',
  'attachment_added',
  'approved',
  'rejected',
  'adjustment_requested',
  'cancelled',
  'completed',
] as const
export type CREventType = (typeof CR_EVENT_TYPES)[number]

/**
 * Etiqueta de cada evento en el timeline, por superficie.
 *
 * Vive acá y no en cada pantalla porque el admin y el portal tenían DOS mapas
 * paralelos de los mismos 13 eventos: agregar un evento obligaba a tocar los
 * dos y nada avisaba si te olvidabas de uno. El texto describe el hecho, no al
 * actor — quién lo hizo sale de `actorRole`/`actorName` del evento.
 */
export const CR_EVENT_LABEL: Record<CREventType, { admin: string; client: string }> = {
  created: { admin: 'Creó la solicitud', client: 'Creó la solicitud' },
  submitted: { admin: 'Envió la solicitud', client: 'Enviaste la solicitud' },
  review_started: { admin: 'Comenzó la revisión', client: 'Comenzamos la revisión' },
  proposal_sent: { admin: 'Envió una propuesta', client: 'Recibiste una propuesta' },
  proposal_updated: { admin: 'Actualizó la propuesta', client: 'Actualizamos la propuesta' },
  status_changed: { admin: 'Cambió el estado', client: 'Cambió el estado' },
  comment_added: { admin: 'Comentó', client: 'Comentó' },
  attachment_added: { admin: 'Adjuntó un archivo', client: 'Adjuntó un archivo' },
  approved: { admin: 'Aprobó el cambio', client: 'Aprobaste el cambio' },
  rejected: { admin: 'Rechazó el cambio', client: 'Rechazaste el cambio' },
  adjustment_requested: { admin: 'Pidió un ajuste', client: 'Pediste un ajuste' },
  cancelled: { admin: 'Canceló la solicitud', client: 'Se canceló la solicitud' },
  completed: { admin: 'Marcó el cambio como completado', client: 'El cambio se completó' },
}

/** Quién ejecutó el evento. `system` queda para automatismos futuros (webhooks, jobs). */
export type CRActorRole = 'admin' | 'client' | 'system'

// ---------------------------------------------------------------------------
// Propuestas
// ---------------------------------------------------------------------------

export const CR_PROPOSAL_STATUSES = ['draft', 'sent', 'superseded', 'accepted', 'rejected'] as const
export type CRProposalStatus = (typeof CR_PROPOSAL_STATUSES)[number]
