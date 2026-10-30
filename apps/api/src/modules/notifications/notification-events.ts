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

  /** El cliente abrió una solicitud desde el portal: entra a la cola del equipo. */
  cr_submitted: def<{ crId: string; crNumber: number; title: string; dealName: string | null }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `Nueva solicitud del cliente #${p.crNumber}`,
    body: (p) => `${p.title}${p.dealName ? ` · ${p.dealName}` : ''}`,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  /**
   * El cliente no rechazó ni aprobó: pide un ajuste sobre la propuesta. La
   * pelota vuelve al equipo, por eso pesa igual que una decisión.
   */
  cr_adjustment_requested: def<{ crId: string; crNumber: number; area: string }>({
    audience: 'admin',
    priority: 'high',
    title: (p) => `CR #${p.crNumber}: el cliente pidió un ajuste`,
    body: (p) => `Área: ${p.area}.`,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  cr_cancelled_by_client: def<{ crId: string; crNumber: number; title: string }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `CR #${p.crNumber} cancelada por el cliente`,
    body: (p) => p.title,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  cr_client_commented: def<{ crId: string; crNumber: number }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `Nuevo comentario del cliente en la CR #${p.crNumber}`,
    actionUrl: (p) => `/change-requests/${p.crId}`,
  }),

  /**
   * El cliente subió archivos a la solicitud (un plano, una captura, una
   * referencia). Adjuntar sin avisar equivalía a que el equipo se enterara solo
   * si entraba a mirar. Sin `dedupeKey`, igual que los comentarios: cada subida
   * es un hecho propio.
   */
  cr_client_attached: def<{ crId: string; crNumber: number; count: number }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `El cliente adjuntó ${p.count === 1 ? 'un archivo' : `${p.count} archivos`} en la CR #${p.crNumber}`,
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

  /**
   * El prospecto tocó un CTA del cierre de la propuesta. No acepta nada:
   * avisa que quiere avanzar o que tiene preguntas, para que alguien le
   * escriba. El mensaje opcional viaja en el cuerpo.
   */
  proposal_interest: def<{
    proposalId: string
    contactName: string
    intent: 'advance' | 'questions'
    message: string | null
  }>({
    audience: 'admin',
    priority: 'high',
    title: (p) =>
      p.intent === 'advance'
        ? `${p.contactName} quiere avanzar con la propuesta`
        : `${p.contactName} tiene preguntas sobre la propuesta`,
    body: (p) => (p.message ? p.message.slice(0, 200) : 'Sin mensaje'),
    actionUrl: (p) => `/proposals/${p.proposalId}`,
  }),

  /**
   * El cliente editó algo de "Onboarding → Marca" desde el portal (identidad
   * visual, archivos de marca o la respuesta de identidad del brief). Sin
   * `dedupeKey` a propósito: cada cambio es una notificación nueva, no un
   * hito que se dispare una sola vez.
   */
  client_brand_updated: def<{
    dealId: string | null
    dealName: string | null
    clientName: string
    section: 'Marca'
    fields: string[]
    action: 'update' | 'add' | 'delete'
    changedAt: string
  }>({
    audience: 'admin',
    priority: 'normal',
    title: (p) => `${p.clientName} actualizó su marca`,
    body: (p) => `${p.fields.join(', ')} · ${p.dealName ?? 'sin proyecto'}`,
    actionUrl: (p) => (p.dealId ? `/onboarding/${p.dealId}` : `/onboarding`),
  }),

  // ── Para el CLIENTE ────────────────────────────────────────────────────────
  // Ninguno de estos existía: el cliente no recibía NADA in-app.

  deliverable_ready: def<{ dealId: string; deliverableTitle: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Nuevo entregable para revisar: ${p.deliverableTitle}`,
    body: () => 'Está esperando tu revisión.',
    actionUrl: () => `/deliverables`,
  }),

  intake_assigned: def<{ dealId: string; formName: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Formulario pendiente: ${p.formName}`,
    body: () => 'Necesitamos que lo completes para avanzar.',
    actionUrl: () => `/forms`,
  }),

  cr_sent: def<{ crId: string; crNumber: number; title: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Solicitud de cambio #${p.crNumber} para tu aprobación`,
    body: (p) => p.title,
    actionUrl: () => `/requests`,
  }),

  invoice_sent: def<{ invoiceId: string; invoiceNumber: number; amount: string; currency: string }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Nueva factura #${p.invoiceNumber}`,
    body: (p) => `${p.currency} ${p.amount} pendiente de pago.`,
    actionUrl: () => `/invoices`,
  }),

  invoice_paid: def<{ invoiceId: string; invoiceNumber: number }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Pago registrado — factura #${p.invoiceNumber}`,
    body: () => 'Gracias. Ya quedó saldada.',
    actionUrl: () => `/invoices`,
  }),

  document_shared: def<{ documentId: string; documentName: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Nuevo documento: ${p.documentName}`,
    actionUrl: () => `/documents`,
  }),

  project_update: def<{ dealId: string; updateTitle: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Novedad del proyecto: ${p.updateTitle}`,
    actionUrl: () => `/dashboard`,
  }),

  cr_commented: def<{ crId: string; crNumber: number }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Nuevo comentario en la solicitud #${p.crNumber}`,
    actionUrl: () => `/requests`,
  }),

  /** El equipo adjuntó material a la solicitud. Contraparte de `cr_client_attached`. */
  cr_attachment_added: def<{ crId: string; crNumber: number; count: number }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `${p.count === 1 ? 'Nuevo archivo' : `${p.count} archivos nuevos`} en la solicitud #${p.crNumber}`,
    actionUrl: () => `/requests`,
  }),

  /**
   * REENVÍO de propuesta (versión 2 en adelante). El primer envío sigue siendo
   * `cr_sent`: para el cliente son dos hechos distintos ("tenés algo para
   * decidir" vs. "cambiamos lo que te habíamos mandado").
   */
  cr_proposal_updated: def<{ crId: string; crNumber: number; version: number }>({
    audience: 'client',
    priority: 'high',
    title: (p) => `Propuesta actualizada en la solicitud #${p.crNumber}`,
    body: (p) => `Versión ${p.version}. Necesitamos tu respuesta.`,
    actionUrl: () => `/requests`,
  }),

  cr_completed: def<{ crId: string; crNumber: number; title: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Solicitud #${p.crNumber} completada`,
    body: (p) => p.title,
    actionUrl: () => `/requests`,
  }),

  cr_cancelled: def<{ crId: string; crNumber: number; title: string }>({
    audience: 'client',
    priority: 'normal',
    title: (p) => `Solicitud #${p.crNumber} cancelada`,
    body: (p) => p.title,
    actionUrl: () => `/requests`,
  }),

  booking_cancelled_by_admin: def<{ bookingId: string; startsAt: string }>({
    audience: 'client',
    priority: 'high',
    title: () => 'Se canceló una reunión agendada',
    body: () => 'Te vamos a contactar para reprogramarla.',
    actionUrl: () => `/dashboard`,
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
