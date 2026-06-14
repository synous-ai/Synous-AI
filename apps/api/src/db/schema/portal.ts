import { pgTable, text, char, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '../../lib/id'

export const portal = pgTable('portal', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  domain: text('domain'),
  // Default actualizado en migración 0017: la agencia opera en Argentina.
  timeZone: text('time_zone').notNull().default('America/Argentina/Buenos_Aires'),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  /** Servicios de prospección habilitados para el módulo setter (null = no configurado). */
  prospectingServices: text('prospecting_services'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
