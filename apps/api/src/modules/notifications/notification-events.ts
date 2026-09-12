/**
 * Catálogo de eventos notificables.
 *
 * ÚNICO lugar donde se define qué significa cada notificación: a quién le
 * importa, cuánto pesa y cómo se redacta. Los services de negocio no arman
 * títulos ni deciden prioridades — emiten un evento tipado y esto lo traduce.
 *
 * Antes cada call site escribía su propio `title`/`type`/`actionUrl` a mano
 * (10 call sites, 10 criterios distintos, y `KNOWN_EVENT_TYPES` de las
 * preferencias ya se había desincronizado: declaraba `client_message`, que
 * nadie emitía, y le faltaban 5 tipos que sí se emiten). Con un catálogo
 * único esa deriva no puede volver a pasar: el tipo del evento se deriva de
 * ACÁ, así que un evento sin entrada no compila.
 *
 * Agregar un evento nuevo = agregar una entrada acá. Nada más.
 */

/** Quién recibe la notificación. */
export type NotificationAudience = 'admin' | 'client'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationEventDef<P = Record<string, never>> {
  /** Audiencia natural del evento. El emisor no puede contradecirla. */
  audience: NotificationAudience
  priority: NotificationPriority
  /** Título corto. Es lo único que se ve en la fila colapsada de la campana. */
  title: (payload: P) => string
  /** Detalle opcional, una línea. */
  body?: (payload: P) => string
  /**
   * Ruta a la que navega la notificación al hacer click. Relativa: el front
   * de cada superficie la resuelve contra su propia base (el admin vive en
   * admin.*, el portal del cliente en su subdominio).
   */
  actionUrl?: (payload: P) => string
}

/**
 * Helper de identidad que preserva el tipo del payload de cada entrada. Sin
 * esto, tipar el catálogo entero de una sola vez colapsaría todos los payloads
 * al mismo tipo y se perdería el chequeo por evento.
 */
const def = <P>(d: NotificationEventDef<P>): NotificationEventDef<P> => d

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = {
  // ── Para el EQUIPO ─────────────────────────────────────────────────────────

  deal_stage_changed: def<{ dealId: string; dealName: string; stageLabel: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `"${p.dealName}" pasó a ${p.stageLabel}`,
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  onboarding_completed: def<{ dealId: string; dealName: string; stageLabel: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Onboarding completado: "${p.dealName}" pasó a ${p.stageLabel}`,
    actionUrl: (p) => `/onboarding/${p.dealId}`,
  }),

  /** Hito de venta más crítico del sistema: hasta ahora no avisaba a nadie. */
  contract_signed: def<{ dealId: string; dealName: string; signerName?: string | null }>({
    audience: 'admin',
    priority: 'urgent',
    title: (p) => `Contrato firmado: "${p.dealName}"`,
    body: (p) => (p.signerName ? `Firmado por ${p.signerName}.` : 'El cliente completó la firma.'),
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  contract_declined: def<{ dealId: string; dealName: string }>({
    audience: 'admin',
    priority: 'urgent',
    title: (p) => `Contrato RECHAZADO: "${p.dealName}"`,
    body: () => 'El cliente rechazó la firma del documento.',
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  payment_received: def<{ invoiceId: string; invoiceNumber: number; amount: string; currency: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Cobro registrado: ${p.currency} ${p.amount}`,
    body: (p) => `Factura #${p.invoiceNumber}.`,
    actionUrl: (p) => `/invoices/${p.invoiceId}`,
  }),

  cr_approved: def<{ crId: string; crNumber: number; dealName: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `CR #${p.crNumber} aprobada por el cliente`,
    body: (p) => p.dealName,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  cr_rejected: def<{ crId: string; crNumber: number; dealName: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `CR #${p.crNumber} rechazada por el cliente`,
    body: (p) => p.dealName,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  /** Bloquea el avance del proyecto: el equipo tiene que reaccionar. */
  deliverable_changes_requested: def<{ dealId: string; deliverableTitle: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Cambios pedidos en "${p.deliverableTitle}"`,
    body: () => 'El cliente revisó el entregable y pidió ajustes.',
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  deliverable_approved: def<{ dealId: string; deliverableTitle: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `"${p.deliverableTitle}" aprobado por el cliente`,
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  intake_completed: def<{ dealId: string; formName: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `Formulario completado: ${p.formName}`,
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  booking_created: def<{ bookingId: string; inviteeName: string; startsAt: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `Nueva reunión agendada por ${p.inviteeName}`,
    actionUrl: () => `/calendar`,
  }),

  booking_cancelled: def<{ bookingId: string; inviteeName: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `${p.inviteeName} canceló la reunión`,
    actionUrl: () => `/calendar`,
  }),

  task_due: def<{ taskId: string; taskTitle: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Tarea vencida: ${p.taskTitle}`,
    actionUrl: () => `/tasks`,
  }),

  deal_stale: def<{ dealId: string; dealName: string; days: number }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `"${p.dealName}" sin actividad hace ${p.days} días`,
    actionUrl: (p) => `/deals/${p.dealId}`,
  }),

  meeting_recorded: def<{ dealId: string | null; title: string }>({
    audience: 'admin',
    priority: 'low',
    title: (p) => `Reunión grabada: ${p.title}`,
    actionUrl: (p) => (p.dealId ? `/deals/${p.dealId}` : `/calendar`),
  }),

  proposal_generated: def<{ proposalId: string; contactName: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `Propuesta generada para ${p.contactName}`,
    actionUrl: (p) => `/proposals/${p.proposalId}`,
  }),

  proposal_accepted: def<{ proposalId: string; contactName: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Propuesta aceptada por ${p.contactName}`,
    actionUrl: (p) => `/proposals/${p.proposalId}`,
  }),

  proposal_viewed: def<{ proposalId: string; contactName: string }>({
    audience: 'admin',
    priority: 'low',
    title: (p) => `${p.contactName} abrió la propuesta`,
    actionUrl: (p) => `/proposals/${p.proposalId}`,
  }),

  // ── Para el CLIENTE ────────────────────────────────────────────────────────
  // Ninguno de estos existía: el cliente no recibía NADA in-app.

  deliverable_ready: def<{ dealId: string; deliverableTitle: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Nuevo entregable para revisar: ${p.deliverableTitle}`,
    body: () => 'Está esperando tu revisión.',
    actionUrl: () => `/portal?tab=deliverables`,
  }),

  intake_assigned: def<{ dealId: string; formName: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Formulario pendiente: ${p.formName}`,
    body: () => 'Necesitamos que lo completes para avanzar.',
    actionUrl: () => `/portal?tab=forms`,
  }),

  cr_sent: def<{ crId: string; crNumber: number; title: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Solicitud de cambio #${p.crNumber} para tu aprobación`,
    body: (p) => p.title,
    actionUrl: () => `/portal?tab=requests`,
  }),

  invoice_sent: def<{ invoiceId: string; invoiceNumber: number; amount: string; currency: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Nueva factura #${p.invoiceNumber}`,
    body: (p) => `${p.currency} ${p.amount} pendiente de pago.`,
    actionUrl: () => `/portal?tab=invoices`,
  }),

  invoice_paid: def<{ invoiceId: string; invoiceNumber: number }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Pago registrado — factura #${p.invoiceNumber}`,
    body: () => 'Gracias. Ya quedó saldada.',
    actionUrl: () => `/portal?tab=invoices`,
  }),

  document_shared: def<{ documentId: string; documentName: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Nuevo documento: ${p.documentName}`,
    actionUrl: () => `/portal?tab=documents`,
  }),

  project_update: def<{ dealId: string; updateTitle: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Novedad del proyecto: ${p.updateTitle}`,
    actionUrl: () => `/portal`,
  }),

  cr_commented: def<{ crId: string; crNumber: number }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Nuevo comentario en la solicitud #${p.crNumber}`,
    actionUrl: () => `/portal?tab=requests`,
  }),

  booking_cancelled_by_admin: def<{ bookingId: string; startsAt: string }>({
    audience: 'client',
    priority: 'high',
    title: () => 'Se canceló una reunión agendada',
    body: () => 'Te vamos a contactar para reprogramarla.',
    actionUrl: () => `/portal`,
  }),
} as const

export type NotificationEventType = keyof typeof NOTIFICATION_EVENTS

/** Payload tipado de un evento concreto, derivado de su entrada del catálogo. */
export type NotificationPayload<T extends NotificationEventType> =
  (typeof NOTIFICATION_EVENTS)[T] extends NotificationEventDef<infer P> ? P : never

export const NOTIFICATION_EVENT_TYPES = Object.keys(NOTIFICATION_EVENTS) as NotificationEventType[]

/** Tipos que van al equipo interno. */
export const ADMIN_EVENT_TYPES = NOTIFICATION_EVENT_TYPES.filter(
  (t) => NOTIFICATION_EVENTS[t].audience === 'admin',
)

/** Tipos que van al cliente del portal. */
export const CLIENT_EVENT_TYPES = NOTIFICATION_EVENT_TYPES.filter(
  (t) => NOTIFICATION_EVENTS[t].audience === 'client',
)
