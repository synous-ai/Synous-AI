import { pgTable, text, integer, boolean, numeric, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { createId } from '../../lib/id'

export const pipeline = pgTable('pipeline', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pipelineStage = pgTable('pipeline_stage', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  pipelineId: text('pipeline_id').notNull().references(() => pipeline.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  probability: numeric('probability', { precision: 5, scale: 4 }),
  isClosed: boolean('is_closed').notNull().default(false),
  isWon: boolean('is_won').notNull().default(false),
  exitCriteria: text('exit_criteria'),
  description: text('description'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_stage_pipeline').on(table.pipelineId, table.displayOrder),
  check('pipeline_stage_probability_check', sql`${table.probability} BETWEEN 0 AND 1`),
])
