import { pgTable, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { deal } from './deals'
import { pipelineStage } from './pipelines'
import { hubUser } from './users'
import { createId } from '../../lib/id'

/**
 * Novedades del proyecto curadas por el equipo, visibles para el cliente en el
 * Client Portal ("estado de proyecto"). NO son tareas internas — son mensajes
 * cortos que el equipo publica manualmente, opcionalmente asociados a la fase
 * (`stage_id`) del pipeline "Producción" en la que se postearon.
 *
 * `stage_id` es NULLABLE: una novedad puede no estar atada a ninguna fase en
 * particular. `created_by` es notNull (siempre la origina un hub_user) — sin
 * onDelete porque hub_user nunca se borra (se desactiva con `is_active`, ver
 * CLAUDE.md "nunca borrar registros"), así que RESTRICT es seguro acá.
 */
export const projectUpdate = pgTable(
  'project_update',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
    dealId: text('deal_id').notNull().references(() => deal.id, { onDelete: 'cascade' }),
    stageId: text('stage_id').references(() => pipelineStage.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdBy: text('created_by').notNull().references(() => hubUser.id),
    archived: boolean('archived').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Listado del cliente/admin: WHERE deal_id [AND archived=false] ORDER BY created_at DESC.
    index('idx_project_update_deal').on(table.dealId, table.createdAt),
  ],
)
