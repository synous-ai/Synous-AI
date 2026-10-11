import { pgTable, text, boolean, integer, jsonb, date, timestamp, index, check, primaryKey, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { deal } from './deals'
import { company } from './companies'
import { createId } from '../../lib/id'

/**
 * Item de checklist de una tarea / tarea de proceso. Un nivel de anidación
 * como máximo (`children`). `done` solo tiene sentido en tareas de proyecto;
 * en las plantillas (process_task) siempre se guarda en false.
 */
export interface ChecklistStep {
  text: string
  done?: boolean
  children?: { text: string; done?: boolean }[]
}

/**
 * Proyecto interno (organización del equipo). Hoy un "proyecto" era solo un
 * deal del pipeline Producción; esta entidad lo vuelve de primera clase.
 *
 * `kind` es el slug de un `process` (plantilla) del mismo portal, validado en
 * el service — NO es un enum de DB para poder crear procesos nuevos sin migrar.
 */
export const project = pgTable('project', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),
  companyId: text('company_id').references(() => company.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  kind: text('kind'),
  status: text('status').notNull().default('not_started'),
  stage: text('stage'),
  priority: text('priority').notNull().default('medium'),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  repoUrl: text('repo_url'),
  stagingUrl: text('staging_url'),
  productionUrl: text('production_url'),
  notes: text('notes'),
  notesImportant: text('notes_important'),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'project_status_check',
    sql`${table.status} IN ('not_started','in_progress','in_review','waiting_client','on_hold','delivered')`,
  ),
  check(
    'project_stage_check',
    sql`${table.stage} IS NULL OR ${table.stage} IN ('discovery','design','development','qa','client_review','changes','delivery')`,
  ),
  check('project_priority_check', sql`${table.priority} IN ('low','medium','high')`),
  index('idx_project_portal_status').on(table.portalId, table.archived, table.status),
  index('idx_project_deal').on(table.dealId),
])

export const projectMember = pgTable('project_member', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  hubUserId: text('hub_user_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.hubUserId] }),
  index('idx_project_member_user').on(table.hubUserId),
])

/**
 * Proceso = plantilla (SOP) cuyas tareas se COPIAN al crear un proyecto.
 * El export se llama `processTemplate` (la tabla sigue siendo `process`) para
 * no tapar el global `process` de Node en los módulos que importan el schema.
 */
export const processTemplate = pgTable('process', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('process_portal_slug_unique').on(table.portalId, table.slug),
])

export const processTask = pgTable('process_task', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  processId: text('process_id').notNull().references(() => processTemplate.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  notes: text('notes'),
  steps: jsonb('steps').$type<ChecklistStep[]>().notNull().default(sql`'[]'::jsonb`),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_process_task_process').on(table.processId, table.position),
])
