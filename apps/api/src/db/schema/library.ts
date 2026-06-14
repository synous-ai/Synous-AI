import { pgTable, text, boolean, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const libraryItem = pgTable('library_item', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  type: text('type').notNull(),
  category: text('category'),
  name: text('name').notNull(),
  description: text('description'),
  storageKey: text('storage_key'),
  url: text('url'),
  /**
   * Pasos/contenido de la entidad operativa sin estado.
   * Para 'procedure': lista ordenada de pasos. Para 'checklist': lista de ítems.
   * Se almacena como JSONB para permitir estructura flexible por variante.
   */
  steps: jsonb('steps').default([]),
  /** Variante operativa: 'procedure' (SOP ordenado) o 'checklist' (lista de verificación). */
  kind: text('kind'),
  createdBy: text('created_by').references(() => hubUser.id),
  /** Responsable del contenido. null = sin dueño asignado. */
  ownerId: text('owner_id').references(() => hubUser.id, { onDelete: 'set null' }),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'library_item_type_check',
    sql`${table.type} IN ('document','sop','template','contract_base','proposal_base','checklist','tech_doc')`,
  ),
  // kind aplica solo a entidades operativas (type='sop' tras la migración 0023).
  check(
    'library_item_kind_check',
    sql`${table.kind} IS NULL OR ${table.kind} IN ('procedure','checklist')`,
  ),
  index('idx_library_item_portal_type').on(table.portalId, table.type),
])
