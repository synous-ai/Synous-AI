import { pgTable, text, integer, boolean, jsonb, time, timestamp, date, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { hubUser } from './users'
import { portal } from './portal'
import { contact } from './contacts'
import { deal } from './deals'
import { citext } from './_custom'
import { createId } from '../../lib/id'

/**
 * Horarios de disponibilidad nombrados y reutilizables.
 * Cada usuario puede tener múltiples schedules; uno de ellos es el default.
 * Los intervalos semanales se almacenan en availability_interval.
 */
export const availabilitySchedule = pgTable('availability_schedule', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  ownerId: text('owner_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  timeZone: text('time_zone').notNull(),
  /** Si true, este schedule se usa cuando el meeting_type no tiene uno asignado. */
  isDefault: boolean('is_default').notNull().default(false),
}, (table) => [
  index('idx_availability_schedule_portal_owner').on(table.portalId, table.ownerId),
])

/** Intervalo horario dentro de un availability_schedule para un día de la semana. */
export const availabilityInterval = pgTable('availability_interval', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  scheduleId: text('schedule_id').notNull().references(() => availabilitySchedule.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
}, (table) => [
  check('availability_interval_day_check', sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
  check('availability_interval_time_check', sql`${table.endTime} > ${table.startTime}`),
  index('idx_availability_interval_schedule_day').on(table.scheduleId, table.dayOfWeek),
])

/**
 * Anulación puntual de disponibilidad para una fecha específica.
 * intervals = [] significa que ese día no está disponible.
 */
export const dateOverride = pgTable('date_override', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  scheduleId: text('schedule_id').notNull().references(() => availabilitySchedule.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  /** Lista de {startTime, endTime} para ese día. Array vacío = bloqueado. */
  intervals: jsonb('intervals').notNull().default([]),
}, (table) => [
  // Un solo override por fecha por schedule.
  unique('date_override_schedule_date_unique').on(table.scheduleId, table.date),
])

/**
 * Reglas de disponibilidad simples (sin schedule).
 * Se usan cuando el owner no tiene availability_schedule configurado.
 */
export const availabilityRule = pgTable('availability_rule', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  ownerId: text('owner_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  // Default actualizado en migración 0017: la agencia opera en Argentina.
  timeZone: text('time_zone').notNull().default('America/Argentina/Buenos_Aires'),
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

/**
 * Tipos de reunión configurables por portal.
 * Soporta reuniones individuales (solo) y grupales (group).
 * Si availability_schedule_id es null, se usan las availability_rule del owner.
 */
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
  /** solo = 1 host, group = múltiples hosts (event_membership). */
  kind: text('kind').notNull().default('solo'),
  /** Para reuniones grupales: null=no pooling, collective=todos disponibles. */
  poolingType: text('pooling_type'),
  color: text('color').default('#3b82f6'),
  /** Si true, el link no se lista públicamente. */
  secret: boolean('secret').notNull().default(false),
  /** Preguntas adicionales para el invitado al reservar. */
  customQuestions: jsonb('custom_questions').notNull().default([]),
  /** Ubicaciones configuradas (ej: Google Meet, Zoom, presencial). */
  locations: jsonb('locations').notNull().default([]),
  startTimeIncrementMin: integer('start_time_increment_min').notNull().default(30),
  minBookingNoticeMin: integer('min_booking_notice_min').notNull().default(240),
  /** rolling=días desde hoy, range=fechas fijas, unlimited=sin límite. */
  bookingWindowType: text('booking_window_type').notNull().default('rolling'),
  bookingWindowDays: integer('booking_window_days').default(60),
  bookingWindowStart: date('booking_window_start'),
  bookingWindowEnd: date('booking_window_end'),
  bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
  bufferAfterMin: integer('buffer_after_min').notNull().default(0),
  dailyLimit: integer('daily_limit'),
  maxInvitees: integer('max_invitees').default(1),
  /** Schedule de disponibilidad vinculado. Null = usa availability_rule del owner. */
  availabilityScheduleId: text('availability_schedule_id').references(() => availabilitySchedule.id, { onDelete: 'set null' }),
}, (table) => [
  unique('meeting_type_portal_id_slug_unique').on(table.portalId, table.slug),
  check('meeting_type_duration_min_check', sql`${table.durationMin} > 0`),
  check('meeting_type_kind_check', sql`${table.kind} IN ('solo', 'group')`),
  check('meeting_type_pooling_check', sql`${table.poolingType} IS NULL OR ${table.poolingType} = 'collective'`),
  check('meeting_type_booking_window_check', sql`${table.bookingWindowType} IN ('rolling', 'range', 'unlimited')`),
])

/** Hosts adicionales para meeting_types grupales. Un host por meeting_type es único. */
export const eventMembership = pgTable('event_membership', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  meetingTypeId: text('meeting_type_id').notNull().references(() => meetingType.id, { onDelete: 'cascade' }),
  hostId: text('host_id').notNull().references(() => hubUser.id, { onDelete: 'cascade' }),
}, (table) => [
  unique('event_membership_meeting_host_unique').on(table.meetingTypeId, table.hostId),
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
  /** Zona horaria del invitado al momento de reservar. */
  inviteeTimeZone: text('invitee_time_zone').notNull().default('UTC'),
  /** Respuestas del invitado a customQuestions del meeting_type. */
  questionAnswers: jsonb('question_answers').notNull().default({}),
  /** Emails de invitados adicionales (para reuniones grupales). */
  guestEmails: jsonb('guest_emails').notNull().default([]),
  /** Token para cancelar sin estar autenticado. */
  cancelToken: text('cancel_token').unique(),
  /** Token para reprogramar sin estar autenticado. */
  rescheduleToken: text('reschedule_token').unique(),
  /** Booking original si este es un reprogramado. */
  rescheduledFromId: text('rescheduled_from_id').references((): any => booking.id, { onDelete: 'set null' }),
}, (table) => [
  check('booking_status_check', sql`${table.status} IN ('confirmed','cancelled','rescheduled')`),
  check('booking_time_check', sql`${table.endsAt} > ${table.startsAt}`),
  index('idx_booking_owner_time').on(table.ownerId, table.startsAt),
  index('idx_booking_deal').on(table.dealId),
  // NOTE: EXCLUDE USING gist (booking_no_overlap) omitted — ver migraciones manuales
])
