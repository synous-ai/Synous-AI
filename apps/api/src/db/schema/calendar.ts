import { pgTable, text, integer, boolean, time, timestamp, index, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { hubUser } from './users'
import { portal } from './portal'
import { contact } from './contacts'
import { deal } from './deals'
import { citext } from './_custom'
import { createId } from '../../lib/id'

export const availabilityRule = pgTable('availability_rule', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  ownerId: text('owner_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  timeZone: text('time_zone').notNull().default('America/Bogota'),
}, (table) => [
  check('availability_rule_day_of_week_check', sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
  check('availability_rule_time_check', sql`${table.endTime} > ${table.startTime}`),
])

export const availabilityBlock = pgTable('availability_block', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  ownerId: text('owner_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  reason: text('reason'),
}, (table) => [
  check('availability_block_time_check', sql`${table.endsAt} > ${table.startsAt}`),
])

export const meetingType = pgTable('meeting_type', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  durationMin: integer('duration_min').notNull(),
  bufferMin: integer('buffer_min').notNull().default(10),
  location: text('location'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
}, (table) => [
  unique('meeting_type_portal_id_slug_unique').on(table.portalId, table.slug),
  check('meeting_type_duration_min_check', sql`${table.durationMin} > 0`),
])

export const booking = pgTable('booking', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  meetingTypeId: text('meeting_type_id').notNull().references(() => meetingType.id),
  ownerId: text('owner_id').notNull().references(() => hubUser.id),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),
  guestName: text('guest_name').notNull(),
  guestEmail: citext('guest_email').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('confirmed'),
  meetLink: text('meet_link'),
  notes: text('notes'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('booking_status_check', sql`${table.status} IN ('confirmed','cancelled','rescheduled')`),
  check('booking_time_check', sql`${table.endsAt} > ${table.startsAt}`),
  index('idx_booking_owner_time').on(table.ownerId, table.startsAt),
  index('idx_booking_deal').on(table.dealId),
  // NOTE: EXCLUDE USING gist (booking_no_overlap) omitted — see manual migrations
])
