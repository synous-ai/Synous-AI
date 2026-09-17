import {
  pgTable,
  text,
  char,
  integer,
  numeric,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  unique,
  check,
  foreignKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql, desc } from 'drizzle-orm'
import {
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_PRIORITIES,
  CR_REJECTION_REASONS,
  CR_EVENT_TYPES,
  CR_PROPOSAL_STATUSES,
} from '@synous/shared'
import { portal } from './portal'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

/**
 * Los CHECK se generan desde el catálogo de `@synous/shared`: agregar un estado
 * allá y olvidarse del constraint acá dejaba a la API aceptando un valor que
 * Postgres rechazaba con un 500 de constraint. Mismo patrón que
 * `file_upload_purpose_check` con FILE_PURPOSES.
 */
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(','))

export const changeRequest = pgTable('change_request', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').notNull().references(() => deal.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  /** Motivo/contexto que escribe el cliente al pedir el cambio ("por qué lo necesito"). */
  context: text('context'),
  priority: text('priority').notNull().default('normal'),
  originalScopeRef: text('original_scope_ref'),
  /** Alcance propuesto vigente, denormalizado desde la propuesta en `current_proposal_id`. */
  proposedScope: text('proposed_scope'),
  origin: text('origin').notNull().default('client'),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  timelineImpactDays: integer('timeline_impact_days').notNull().default(0),
  newDeliveryDate: date('new_delivery_date'),
  /**
   * Propuesta vigente (la última enviada) y la que el cliente terminó
   * aprobando. Se guardan las DOS: `current_proposal_id` puede seguir
   * avanzando en una renegociación posterior, y sin `approved_proposal_id` se
   * perdería sobre qué números se cerró el acuerdo.
   */
  currentProposalId: text('current_proposal_id'),
  approvedProposalId: text('approved_proposal_id'),
  /** Motivo estructurado de la decisión del cliente (rechazo). */
  decisionReason: text('decision_reason'),
  decisionComment: text('decision_comment'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewStartedAt: timestamp('review_started_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: text('approved_by').references(() => clientAccount.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => hubUser.id),
  /** Cliente que la creó desde el portal. Excluyente con `created_by` en la práctica. */
  createdByClient: text('created_by_client').references(() => clientAccount.id),
  /**
   * Id que genera el portal antes de mandar el POST. Anti double-submit: un
   * segundo envío con el mismo id devuelve la CR ya creada en vez de crear una
   * gemela (el índice único parcial de abajo lo garantiza aunque dos requests
   * lleguen en paralelo).
   */
  clientRequestId: text('client_request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('change_request_deal_id_number_unique').on(table.dealId, table.number),
  check('change_request_origin_check', sql`${table.origin} IN ('client','agency')`),
  check('change_request_status_check', sql`${table.status} IN (${inList(CHANGE_REQUEST_STATUSES)})`),
  check('change_request_priority_check', sql`${table.priority} IN (${inList(CHANGE_REQUEST_PRIORITIES)})`),
  check('change_request_decision_reason_check', sql`${table.decisionReason} IN (${inList(CR_REJECTION_REASONS)})`),
  index('idx_cr_deal').on(table.dealId, table.status),
  // Cola de trabajo del equipo: filtra por portal + estado y ordena por fecha.
  index('idx_cr_portal_status_created').on(table.portalId, table.status, desc(table.createdAt)),
  // PARCIAL: la mayoría de las CRs (las que crea el equipo) no traen
  // clientRequestId, y un unique normal las haría colisionar entre sí por NULL
  // en algunos motores. Parcial también deja el índice chico.
  uniqueIndex('uq_cr_deal_client_request').on(table.dealId, table.clientRequestId).where(sql`client_request_id IS NOT NULL`),
  // FKs a change_request_proposal declaradas acá y no inline: las dos tablas se
  // referencian mutuamente (la CR apunta a su propuesta vigente, la propuesta a
  // su CR). El callback de extras se evalúa perezoso, así que en runtime no hay
  // problema — pero TypeScript sí entra en ciclo (TS7022) si lee el tipo de la
  // otra tabla desde acá. `proposalIdColumn()` lo corta con un tipo explícito.
  foreignKey({
    name: 'change_request_current_proposal_fk',
    columns: [table.currentProposalId],
    foreignColumns: [proposalIdColumn()],
  }),
  foreignKey({
    name: 'change_request_approved_proposal_fk',
    columns: [table.approvedProposalId],
    foreignColumns: [proposalIdColumn()],
  }),
])

/** Ver el comentario de las FKs de arriba: el tipo de retorno explícito rompe el ciclo de inferencia. */
function proposalIdColumn(): AnyPgColumn {
  return changeRequestProposal.id
}

/**
 * Versionado de propuestas: cada envío al cliente es una fila nueva, inmutable
 * una vez enviada.
 *
 * Es el SNAPSHOT que se aprueba. Sin esto, renegociar pisaba el monto y el
 * plazo en la CR y después no había forma de reconstruir sobre qué números
 * había dicho que sí el cliente — el dato que justamente se factura.
 */
export const changeRequestProposal = pgTable('change_request_proposal', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  scope: text('scope'),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  timelineImpactDays: integer('timeline_impact_days').notNull().default(0),
  newDeliveryDate: date('new_delivery_date'),
  note: text('note'),
  status: text('status').notNull().default('draft'),
  createdBy: text('created_by').references(() => hubUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedByClient: text('decided_by_client').references(() => clientAccount.id),
}, (table) => [
  unique('uq_cr_proposal_version').on(table.changeRequestId, table.version),
  check('change_request_proposal_status_check', sql`${table.status} IN (${inList(CR_PROPOSAL_STATUSES)})`),
  index('idx_cr_proposal_cr_version').on(table.changeRequestId, desc(table.version)),
])

export const changeRequestItem = pgTable('change_request_item', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  /**
   * Propuesta a la que pertenece el ítem. NULL = ítem a nivel CR (los que ya
   * existían antes del versionado): siguen funcionando igual y se muestran en
   * el detalle aunque no cuelguen de ninguna versión.
   */
  proposalId: text('proposal_id').references(() => changeRequestProposal.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: numeric('quantity', { precision: 8, scale: 2 }).notNull().default('1'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).generatedAlwaysAs(sql`unit_price * quantity`),
}, (table) => [
  index('idx_cr_item_cr').on(table.changeRequestId),
  index('idx_cr_item_proposal').on(table.proposalId),
])

export const changeRequestComment = pgTable('change_request_comment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  authorUser: text('author_user').references(() => hubUser.id),
  authorClient: text('author_client').references(() => clientAccount.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('change_request_comment_author_check', sql`(${table.authorUser} IS NOT NULL AND ${table.authorClient} IS NULL) OR (${table.authorUser} IS NULL AND ${table.authorClient} IS NOT NULL)`),
  index('idx_cr_comment_cr').on(table.changeRequestId, table.createdAt),
])

export const changeRequestAttachment = pgTable('change_request_attachment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  /** Si viene, el adjunto cuelga de ese comentario (y no de la CR "suelta"). */
  commentId: text('comment_id').references(() => changeRequestComment.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type'),
  /** Mismo tipo y nombre que `file_upload.size_bytes`, de donde se copia al reclamar. */
  sizeBytes: integer('size_bytes'),
  uploadedBy: text('uploaded_by').references(() => hubUser.id),
  uploadedByClient: text('uploaded_by_client').references(() => clientAccount.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_cr_attachment_storage_key').on(table.storageKey),
  index('idx_cr_attachment_cr').on(table.changeRequestId),
])

/**
 * Event log estructurado de la CR (no solo cambios de estado).
 *
 * Se amplía la tabla que ya existía en vez de crear una `change_request_event`
 * nueva: serían dos historiales del mismo objeto que habría que unir y ordenar
 * en cada lectura, con la garantía de que tarde o temprano divergen. `metadata`
 * guarda el dato duro del evento (versión y monto de la propuesta, motivo del
 * rechazo, área del ajuste) para poder reconstruir DESPUÉS qué se aprobó.
 */
export const changeRequestHistory = pgTable('change_request_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  changeRequestId: text('change_request_id').notNull().references(() => changeRequest.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull().default('status_changed'),
  fromStatus: text('from_status'),
  /** NULL en los eventos que no son un cambio de estado (comentario, adjunto). */
  toStatus: text('to_status'),
  comment: text('comment'),
  actorRole: text('actor_role'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  changedByUser: text('changed_by_user').references(() => hubUser.id),
  changedByClient: text('changed_by_client').references(() => clientAccount.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('change_request_history_event_type_check', sql`${table.eventType} IN (${inList(CR_EVENT_TYPES)})`),
  check('change_request_history_actor_role_check', sql`${table.actorRole} IN ('admin','client','system')`),
  index('idx_cr_history_cr').on(table.changeRequestId, desc(table.changedAt)),
])
