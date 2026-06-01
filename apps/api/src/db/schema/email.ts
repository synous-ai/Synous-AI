import { pgTable, text, uuid, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { contact } from './contacts'
import { deal } from './deals'
import { citext, inet } from './_custom'
import { createId } from '../../lib/id'

export const emailSend = pgTable('email_send', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  dealId: text('deal_id').references(() => deal.id, { onDelete: 'set null' }),
  fromEmail: citext('from_email').notNull(),
  toEmail: citext('to_email').notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html'),
  trackingId: uuid('tracking_id').notNull().defaultRandom(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_email_send_contact').on(table.contactId),
  index('idx_email_send_tracking').on(table.trackingId),
])

export const emailEvent = pgTable('email_event', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  emailId: text('email_id').notNull().references(() => emailSend.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  linkUrl: text('link_url'),
  userAgent: text('user_agent'),
  ipAddress: inet('ip_address'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('email_event_type_check', sql`${table.type} IN ('opened','clicked','bounced','unsubscribed')`),
  index('idx_email_event_email').on(table.emailId, table.type),
])
