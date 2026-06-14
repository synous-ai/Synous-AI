import { pgTable, text, integer, boolean, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { deal } from './deals'
import { contact } from './contacts'
import { company } from './companies'
import { booking } from './calendar'
import { createId } from '../../lib/id'

export const note = pgTable('note', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  companyId: text('company_id').references(() => company.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_note_deal').on(table.dealId),
  index('idx_note_contact').on(table.contactId),
  index('idx_note_company').on(table.companyId),
])

export const task = pgTable('task', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  assignedTo: text('assigned_to').references(() => hubUser.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('medium'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  companyId: text('company_id').references(() => company.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // 'blocked' agregado en migración 0020: tarea bloqueada por dependencia externa.
  check('task_status_check', sql`${table.status} IN ('pending','in_progress','completed','cancelled','blocked')`),
  check('task_priority_check', sql`${table.priority} IN ('low','medium','high')`),
  index('idx_task_assignee').on(table.assignedTo, table.status),
  index('idx_task_due').on(table.dueDate).where(sql`status <> 'completed'`),
  index('idx_task_deal').on(table.dealId),
  index('idx_task_contact').on(table.contactId),
  index('idx_task_company').on(table.companyId),
  // Compuesto para el listado (WHERE portal ORDER BY created_at DESC); portal_id sigue de columna líder.
  index('idx_task_portal_created').on(table.portalId, table.createdAt, table.id),
])

export const call = pgTable('call', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  title: text('title'),
  body: text('body'),
  direction: text('direction'),
  durationSec: integer('duration_sec'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('call_direction_check', sql`${table.direction} IN ('inbound','outbound')`),
  index('idx_call_deal').on(table.dealId),
  index('idx_call_contact').on(table.contactId),
])

export const meeting = pgTable('meeting', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  location: text('location'),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  fathomSummary: text('fathom_summary'),
  fathomTranscriptUrl: text('fathom_transcript_url'),
  fathomActionItems: jsonb('fathom_action_items'),
  fathomParticipants: jsonb('fathom_participants'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_meeting_deal').on(table.dealId),
  index('idx_meeting_booking').on(table.bookingId),
])
