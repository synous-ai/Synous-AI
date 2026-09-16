import { pgTable, text, integer, boolean, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { deal } from './deals'
import { clientAccount } from './client-portal'
import { changeRequest } from './change-requests'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const deliverable = pgTable('deliverable', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  dealId: text('deal_id').notNull().references(() => deal.id),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  url: text('url'),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('pending_review'),
  feedback: text('feedback'),
  /**
   * ¿El cliente ve este entregable en su Portal?
   *
   * Default `true` porque un "entregable" es, por definición, algo que se le
   * entrega al cliente — y porque así las filas que ya existían mantienen
   * exactamente el comportamiento anterior (antes NO había filtro: el cliente
   * veía todo lo adjuntado al deal).
   *
   * Se marca en `false` para el material interno que el proceso de entrega
   * define como no compartible: Blueprint técnico, Diagnóstico de negocio,
   * checklist de QA crudo. Lo consumen `clientDeliverables` y
   * `assertClientDeliverable` en modules/client.
   */
  visibleToClient: boolean('visible_to_client').notNull().default(true),
  /**
   * Change request que origina este entregable. Se vincula A MANO desde el
   * admin — aprobar una CR no crea entregables sola. Ver el comentario gemelo
   * en `invoice.change_request_id`.
   */
  changeRequestId: text('change_request_id').references(() => changeRequest.id),
  reviewedBy: text('reviewed_by').references(() => clientAccount.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => hubUser.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('deliverable_type_check', sql`${table.type} IN ('design','prototype','staging','final')`),
  check('deliverable_status_check', sql`${table.status} IN ('pending_review','approved','changes_requested')`),
  index('idx_deliverable_deal').on(table.dealId),
  index('idx_deliverable_change_request').on(table.changeRequestId),
])
